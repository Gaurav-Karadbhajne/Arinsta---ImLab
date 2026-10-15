using System.Security.Claims;
using FluentValidation;
using ImLab.Models.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ImLab.Web.Filters;

/// <summary>Checks that the token carries the permission key. Keeps controllers free of access code.</summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class PermissionAttribute(string key) : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext ctx)
    {
        if (ctx.HttpContext.User.Identity?.IsAuthenticated != true) { ctx.Result = new UnauthorizedResult(); return; }
        if (!ctx.HttpContext.User.HasClaim("perm", key)) ctx.Result = new ForbidResult();
    }
}

/// <summary>Runs the FluentValidation validator of every action argument.</summary>
public sealed class ValidationFilter(IServiceProvider sp) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        foreach (var arg in ctx.ActionArguments.Values.Where(a => a is not null))
        {
            var vt = typeof(IValidator<>).MakeGenericType(arg!.GetType());
            if (sp.GetService(vt) is not IValidator v) continue;
            var result = await v.ValidateAsync(new ValidationContext<object>(arg));
            if (!result.IsValid)
            {
                ctx.Result = new BadRequestObjectResult(new { message = result.Errors[0].ErrorMessage, errors = result.Errors.Select(e => new { field = e.PropertyName, message = e.ErrorMessage }) });
                return;
            }
        }
        await next();
    }
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal U => accessor.HttpContext!.User;
    public long UserId => long.Parse(U.FindFirst("sub")?.Value ?? U.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    public long CenterId => long.Parse(U.FindFirst("center")!.Value);
    public long TenantId => long.Parse(U.FindFirst("tid")!.Value);
    public decimal MaxDiscountPercent => decimal.Parse(U.FindFirst("maxdisc")?.Value ?? "100", System.Globalization.CultureInfo.InvariantCulture);
}
