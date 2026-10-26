using ImLab.Models.Services;
using ImLab.Models.ViewModels;
using ImLab.Web.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using ImLab.Web.Reports;

namespace ImLab.Web.Controllers;

// Controllers stay thin: bind the request, check the permission, call ONE service method, return the result.

[ApiController, Route("api/v1/auth")]
// Auth is anonymous by nature; everything else in the API sits behind [Authorize].
public sealed class AuthController(AuthService auth, CaptchaService captcha) : ControllerBase
{
    [HttpPost("login"), AllowAnonymous]
    public Task<LoginResult> Login(LoginRequest request, CancellationToken ct) => auth.LoginAsync(request, ct);

    // Returns a fresh math captcha. Anonymous; rate limits would live here in a public deployment.
    [HttpGet("captcha"), AllowAnonymous]
    public CaptchaVm Captcha() => captcha.Create();
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

    /// <summary>Everything the registration screen needs in one call (cached 10 min).</summary>
    [HttpGet("registration-data"), Permission(Perm.BookingCreate)]
    public Task<RegistrationDataVm> RegistrationData(CancellationToken ct) => bookings.RegistrationDataAsync(ct);

        /// <summary>Rebook support: patients matching a mobile (exact) or name (prefix), with recent visits.</summary>
    [HttpGet("patient-lookup"), Permission(Perm.BookingCreate)]
    public Task<List<PatientMatchVm>> PatientLookup(string? mobile, string? name, CancellationToken ct) =>
        bookings.LookupPatientsAsync(mobile, name, ct);

    // Quick-add (+) buttons on the registration screen; new option comes back so the dropdown can select it at once.
    [HttpPost("masters/doctors"), Permission(Perm.BookingCreate)]
    public Task<MasterOption> AddDoctor(QuickAdd q, CancellationToken ct) => bookings.AddDoctorAsync(q, ct);
    [HttpPost("masters/hospitals"), Permission(Perm.BookingCreate)]
    public Task<MasterOption> AddHospital(QuickAdd q, CancellationToken ct) => bookings.AddHospitalAsync(q, ct);
    [HttpPost("masters/collectors"), Permission(Perm.BookingCreate)]
    public Task<MasterOption> AddCollector(QuickAdd q, CancellationToken ct) => bookings.AddCollectorAsync(q, ct);

    [HttpGet, Permission(Perm.BookingView)]
    public Task<PagedResult<BookingRowVm>> Search([FromQuery] BookingQuery q, CancellationToken ct) => bookings.SearchAsync(q, ct);

        // Five cards above the grid - same filters as the grid, no AfterId.
    [HttpGet("stats"), Permission(Perm.BookingView)]
    public Task<BookingStatsVm> Stats([FromQuery] BookingQuery q, CancellationToken ct) => bookings.StatsAsync(q, ct);

    // Dropdown values for the Filters panel.
    [HttpGet("filters"), Permission(Perm.BookingView)]
    public Task<FilterOptionsVm> Filters(CancellationToken ct) => bookings.FilterOptionsAsync(ct);

    // View drawer: everything for one booking in one round-trip.
    [HttpGet("{id:long}/detail"), Permission(Perm.BookingView)]
    public Task<BookingDetailVm> Detail(long id, CancellationToken ct) => bookings.DetailAsync(id, ct);

    // Receipts page: every payment + refund of one visit.
    [HttpGet("{id:long}/receipts"), Permission(Perm.BookingView)]
    public Task<ReceiptListVm> Receipts(long id, CancellationToken ct) => bookings.ReceiptListAsync(id, ct);

    // Rebook button: load one patient with recent visits for the registration screen.
    [HttpGet("patients/{patientId:long}"), Permission(Perm.BookingView)]
    public Task<PatientMatchVm> Patient(long patientId, CancellationToken ct) => bookings.PatientForRebookAsync(patientId, ct);

    [HttpPost, Permission(Perm.BookingCreate)]
    public Task<BookingCreatedVm> Create(BookingForm form, CancellationToken ct) => bookings.CreateAsync(form, ct);

    /// <summary>Server-rendered receipt: an MVC Razor view, shown by the screen in a frame or printed.</summary>
    [HttpGet("{id:long}/receipt"), Permission(Perm.BookingView)]
    public async Task<IActionResult> Receipt(long id, CancellationToken ct)
    {
        var vm = await bookings.ReceiptAsync(id, ct);
        return vm is null ? NotFound() : View("~/Views/Receipts/Receipt.cshtml", vm);
    }
        /// <summary>Same receipt as a real PDF file - the client downloads it directly (no tab, no print dialog).</summary>
    [HttpGet("{id:long}/receipt.pdf"), Permission(Perm.BookingView)]
    public async Task<IActionResult> ReceiptPdf(long id, CancellationToken ct)
    {
        var vm = await bookings.ReceiptAsync(id, ct);
        return vm is null ? NotFound() : File(Reports.ReceiptPdf.Build(vm), "application/pdf", $"Receipt-{vm.BillNo}.pdf");
    } 

        // ---- Search page actions -------------------------------------------------------------

    [HttpPost("{id:long}/collect"), Permission(Perm.BookingCreate)]
    public Task<CollectResultVm> Collect(long id, CollectForm f, CancellationToken ct) => bookings.CollectAsync(id, f, ct);

    [HttpPost("{id:long}/refund"), Permission(Perm.BookingCreate)]
    public Task<RefundResultVm> Refund(long id, RefundForm f, CancellationToken ct) => bookings.RefundAsync(id, f, ct);

    [HttpPost("{id:long}/tests"), Permission(Perm.BookingCreate)]
    public Task<AddTestsResultVm> AddTests(long id, AddTestsForm f, CancellationToken ct) => bookings.AddTestsAsync(id, f, ct);

    [HttpPost("{id:long}/delete"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> Delete(long id, DeleteBookingForm f, CancellationToken ct)
    { await bookings.DeleteBookingAsync(id, f.Reason, ct); return NoContent(); }

    // ---- Delete Log: soft-deleted lines can be put back from Reports -------------------

    [HttpGet("deleted"), Permission(Perm.BookingView)]
    // Parameter must NOT be named "q": a query key "q" would then bind to the
    // complex parameter itself and silently drop the type/date/q filters.
    public Task<PagedResult<DeletedRowVm>> Deleted([FromQuery] DeleteLogQuery filter, CancellationToken ct) =>
        bookings.DeleteLogAsync(filter, ct);

    [HttpPost("{id:long}/restore"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> Restore(long id, CancellationToken ct)
    { await bookings.RestoreBookingAsync(id, ct); return NoContent(); }

    [HttpPost("tests/{testId:long}/delete"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> DeleteTest(long testId, DeleteBookingForm f, CancellationToken ct)
    { await bookings.DeleteTestAsync(testId, f.Reason, ct); return NoContent(); }

    [HttpPost("tests/{testId:long}/restore"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> RestoreTest(long testId, CancellationToken ct)
    { await bookings.RestoreTestAsync(testId, ct); return NoContent(); }

    [HttpPost("packages/{packageId:long}/delete"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> DeletePackage(long packageId, DeleteBookingForm f, CancellationToken ct)
    { await bookings.DeletePackageAsync(packageId, f.Reason, ct); return NoContent(); }

    [HttpPost("packages/{packageId:long}/restore"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> RestorePackage(long packageId, CancellationToken ct)
    { await bookings.RestorePackageAsync(packageId, ct); return NoContent(); }

    [HttpPost("payments/{paymentId:long}/delete"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> DeletePayment(long paymentId, DeleteBookingForm f, CancellationToken ct)
    { await bookings.DeletePaymentAsync(paymentId, f.Reason, ct); return NoContent(); }

    [HttpPost("payments/{paymentId:long}/restore"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> RestorePayment(long paymentId, CancellationToken ct)
    { await bookings.RestorePaymentAsync(paymentId, ct); return NoContent(); }

    [HttpPut("patients/{patientId:long}"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> UpdatePatient(long patientId, PatientEditForm f, CancellationToken ct)
    { await bookings.UpdatePatientAsync(patientId, f, ct); return NoContent(); }

    [HttpPut("{id:long}/meta"), Permission(Perm.BookingCreate)]
    public async Task<IActionResult> UpdateMeta(long id, BookingMetaForm f, CancellationToken ct)
    { await bookings.UpdateMetaAsync(id, f, ct); return NoContent(); }

    /// <summary>Receipt HTML for one payment/refund row (shown in the receipt modal).</summary>
    [HttpGet("payments/{paymentId:long}/receipt"), Permission(Perm.BookingView)]
    public async Task<IActionResult> PaymentReceipt(long paymentId, CancellationToken ct)
    {
        var vm = await bookings.PaymentReceiptAsync(paymentId, ct);
        return vm is null ? NotFound() : View("~/Views/Receipts/PaymentReceipt.cshtml", vm);
    }

    /// <summary>Same payment receipt as a direct PDF download.</summary>
    [HttpGet("payments/{paymentId:long}/receipt.pdf"), Permission(Perm.BookingView)]
    public async Task<IActionResult> PaymentReceiptPdf(long paymentId, CancellationToken ct)
    {
        var vm = await bookings.PaymentReceiptAsync(paymentId, ct);
        return vm is null ? NotFound() : File(Reports.PaymentReceiptPdf.Build(vm), "application/pdf", $"Receipt-{vm.ReceiptNo}.pdf");
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

[ApiController, Route("api/v1/master"), Authorize]
public sealed class MasterController(MasterService master) : ControllerBase
{
    // Every endpoint checks a permission key from the JWT (see Filters.cs PermissionAttribute).

    [HttpGet("tests"), Permission(Perm.MasterView)]
    public Task<List<TestRowVm>> Tests([FromQuery] TestQuery q, CancellationToken ct) => master.ListTestsAsync(q, ct);

    [HttpGet("departments"), Permission(Perm.MasterView)]
    public Task<List<DepartmentVm>> Departments(CancellationToken ct) => master.ListDepartmentsAsync(ct);

    [HttpPost("tests"), Permission(Perm.MasterManage)]
    public async Task<IActionResult> CreateTest(TestForm f, CancellationToken ct)
    { await master.CreateTestAsync(f, ct); return NoContent(); }   // 204: the client reloads the grid

    [HttpPut("tests/{id:long}"), Permission(Perm.MasterManage)]
    public async Task<IActionResult> UpdateTest(long id, TestForm f, CancellationToken ct)
    { await master.UpdateTestAsync(id, f, ct); return NoContent(); }

    [HttpPost("tests/{id:long}/toggle-active"), Permission(Perm.MasterManage)]
    public async Task<IActionResult> ToggleTest(long id, CancellationToken ct)
    { await master.ToggleTestActiveAsync(id, ct); return NoContent(); }
}