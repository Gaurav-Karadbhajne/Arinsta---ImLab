using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using ImLab.Models.Data;
using ImLab.Models.Repositories;
using ImLab.Models.Services;
using ImLab.Models.Validators;
using ImLab.Web.Filters;
using ImLab.Web.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

var secretKey = Convert.FromBase64String(cfg["Security:SecretKeyBase64"]!);
var protector = new SecretProtector(secretKey, cfg.GetValue<bool>("Security:AllowPlainSecrets") && builder.Environment.IsDevelopment());

// Command line helper:  dotnet run --project src/ImLab.Web -- encrypt "database password"
if (args.Length == 2 && args[0] == "encrypt") { Console.WriteLine(protector.Protect(args[1])); return; }

// Command line helper:  dotnet run --project src/ImLab.Web -- hash "user password"
if (args.Length == 2 && args[0] == "hash") { Console.WriteLine(PasswordHasher.Hash(args[1])); return; }

// ---- Services (the "M" side: models, services, repositories) ----
builder.Services.AddSingleton(protector);
builder.Services.AddMemoryCache();
var redis = cfg.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redis)) builder.Services.AddStackExchangeRedisCache(o => o.Configuration = redis);
else builder.Services.AddDistributedMemoryCache();

builder.Services.AddDbContext<MasterDbContext>(o => o.UseMySql(cfg.GetConnectionString("Master")!, new MySqlServerVersion(new Version(8, 0, 36)))
    .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));
builder.Services.AddScoped<ITenantContext, TenantContext>();
builder.Services.AddScoped<TenantDbContext>();           // connection string comes from the resolved tenant
builder.Services.AddScoped<ITenantStore, TenantStore>();
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<BookingRepository>();
builder.Services.AddScoped<DashboardRepository>();
builder.Services.AddScoped<ConfigRepository>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<ConfigService>();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddHttpContextAccessor();
var jwt = new JwtOptions(cfg["Jwt:Key"]!, cfg["Jwt:Issuer"]!, cfg["Jwt:Audience"]!, cfg.GetValue<int>("Jwt:Minutes"));
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddValidatorsFromAssemblyContaining<LoginRequestValidator>();

// ---- Security ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;           // keep claim names such as sub, cid, perm exactly as issued
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = jwt.Issuer, ValidateAudience = true, ValidAudience = jwt.Audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        ClockSkew = TimeSpan.FromMinutes(1), NameClaimType = "name", RoleClaimType = "role"
    };
});
builder.Services.AddAuthorization();

// ---- Speed and fairness ----
builder.Services.AddResponseCompression(o => { o.EnableForHttps = true; o.Providers.Add<BrotliCompressionProvider>(); o.Providers.Add<GzipCompressionProvider>(); });
var perMinute = cfg.GetValue<int>("RateLimit:PerTenantPerMinute");
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(ctx.User.FindFirst("cid")?.Value ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// ---- MVC (the "C" and "V" side) ----
builder.Services.AddControllersWithViews(o => o.Filters.Add<ValidationFilter>()).AddJsonOptions(o => o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var app = builder.Build();

app.UseExceptionHandler(e => e.Run(async ctx =>
{
    var ex = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    ctx.Response.StatusCode = ex is AppException a ? a.Status : 500;
    await ctx.Response.WriteAsJsonAsync(new { message = ex is AppException ? ex.Message : "Something went wrong." });
}));
app.UseResponseCompression();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseRateLimiter();
app.UseMiddleware<TenantMiddleware>();    // after authentication: reads the signed cid claim
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("index.html");      // Angular routes
app.Run();
