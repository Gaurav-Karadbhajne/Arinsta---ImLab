using ImLab.Models.Services;
using ImLab.Models.ViewModels;
using ImLab.Web.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace ImLab.Web.Controllers;

// Controllers stay thin: bind the request, check the permission, call ONE service method, return the result.

[ApiController, Route("api/v1/auth")]
public sealed class AuthController(AuthService auth) : ControllerBase
{
    [HttpPost("login"), AllowAnonymous]
    public Task<LoginResult> Login(LoginRequest request, CancellationToken ct) => auth.LoginAsync(request, ct);
}

[ApiController, Route("api/v1/dashboard"), Authorize]
public sealed class DashboardController(DashboardService dashboard) : ControllerBase
{
    [HttpGet, Permission(Perm.DashboardView)]
    public Task<DashboardVm> Get(CancellationToken ct) => dashboard.GetAsync(ct);
}

[ApiController, Route("api/v1/bookings"), Authorize]
public sealed class BookingsController(BookingService bookings) : Controller
{
    [HttpGet("catalog"), Permission(Perm.BookingCreate)]
    public Task<List<TestPickerItem>> Catalog(CancellationToken ct) => bookings.CatalogAsync(ct);

    [HttpGet, Permission(Perm.BookingView)]
    public Task<PagedResult<BookingRowVm>> Search([FromQuery] BookingQuery q, CancellationToken ct) => bookings.SearchAsync(q, ct);

    [HttpPost, Permission(Perm.BookingCreate)]
    public Task<BookingCreatedVm> Create(BookingForm form, CancellationToken ct) => bookings.CreateAsync(form, ct);

    /// <summary>Server-rendered receipt: an MVC Razor view, shown by the screen in a frame or printed.</summary>
    [HttpGet("{id:long}/receipt"), Permission(Perm.BookingView)]
    public async Task<IActionResult> Receipt(long id, CancellationToken ct)
    {
        var vm = await bookings.ReceiptAsync(id, ct);
        return vm is null ? NotFound() : View("~/Views/Receipts/Receipt.cshtml", vm);
    }
}

[ApiController, Route("api/v1/outsource"), Authorize]
public sealed class OutsourceController(BookingService bookings) : ControllerBase
{
    [HttpGet, Permission(Perm.OutsourceView)]
    public Task<PagedResult<OutsourceRowVm>> List([FromQuery] OutsourceQuery q, CancellationToken ct) => bookings.OutsourceAsync(q, ct);
}

[ApiController, Route("api/v1/config"), Authorize]
public sealed class ConfigController(ConfigService config) : ControllerBase
{
    /// <summary>Config for the signed-in lab. Supports ETag so the browser only downloads it again when it changed.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var vm = await config.GetAsync(ct);
        var etag = new EntityTagHeaderValue($"\"{vm.Version}\"");
        Response.Headers.ETag = etag.ToString();
        if (Request.Headers.IfNoneMatch.ToString() == etag.ToString()) return StatusCode(StatusCodes.Status304NotModified);
        return Ok(vm);
    }

    [HttpPut, Permission(Perm.ConfigEdit)]
    public async Task<IActionResult> Put(ConfigUpdate update, CancellationToken ct) { await config.UpdateAsync(update, ct); return NoContent(); }
}
