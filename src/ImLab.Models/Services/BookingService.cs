using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using ImLab.Models.Enums;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;
using Microsoft.Extensions.Caching.Memory;

namespace ImLab.Models.Services;

public sealed class BookingService(BookingRepository repo, ICurrentUser user, ITenantContext tenant, IMemoryCache cache)
{
    public Task<List<TestPickerItem>> CatalogAsync(CancellationToken ct) =>
        cache.GetOrCreateAsync($"catalog:{tenant.Id}", e => { e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10); return repo.GetCatalogAsync(ct); })!;

    public Task<PagedResult<BookingRowVm>> SearchAsync(BookingQuery q, CancellationToken ct) => repo.SearchAsync(user.CenterId, q, ct);
    public Task<PagedResult<OutsourceRowVm>> OutsourceAsync(OutsourceQuery q, CancellationToken ct) => repo.OutsourceAsync(user.CenterId, q, ct);
    public Task<ReceiptVm?> ReceiptAsync(long id, CancellationToken ct) => repo.GetReceiptAsync(user.CenterId, id, tenant.CompanyName, ct);

    public async Task<BookingCreatedVm> CreateAsync(BookingForm f, CancellationToken ct)
    {
        if (f.DiscountPercent > user.MaxDiscountPercent) throw new AppException(403, $"Your role allows a discount of up to {user.MaxDiscountPercent}%.");

        var ids = f.Tests.Select(t => t.TestId).Distinct().ToList();
        var tests = await repo.GetTestsAsync(ids, ct);
        if (tests.Count != ids.Count) throw new AppException(400, "One or more tests are not available.");

        var (total, discount, net) = BookingTotals.Calc(tests.Select(t => t.Price), f.DiscountPercent);
        if (f.PaidAmount > net) throw new AppException(400, "Payment is more than the bill amount.");

        var result = await repo.InTransactionAsync(async () =>
        {
            Patient? newPatient = null; string uid;
            if (f.PatientId is long pid)
            {
                var existing = await repo.GetPatientAsync(pid, ct) ?? throw new AppException(404, "Patient not found.");
                uid = existing.Uid;
            }
            else
            {
                var n = await repo.NextNumberAsync("patient_uid", ct);
                uid = $"P{DateTime.UtcNow:yy}-{n:D6}";
                newPatient = new Patient
                {
                    Uid = uid, Title = f.Title, FirstName = f.FirstName.Trim(), LastName = f.LastName?.Trim(), Gender = f.Gender,
                    AgeYears = f.AgeYears, Mobile = f.Mobile, Email = f.Email, CreatedAt = DateTime.UtcNow
                };
            }
            var labNo = await repo.NextNumberAsync("lab_no", ct);
            var billSeq = await repo.NextNumberAsync("bill_no", ct);
            var billNo = $"B{DateTime.UtcNow:yy}{billSeq:D6}";
            var now = DateTime.UtcNow;

            var booking = new Booking
            {
                LabNo = labNo, BillNo = billNo, PatientId = f.PatientId ?? 0, CenterId = user.CenterId, ReferralDoctor = f.ReferralDoctor, Corporate = f.Corporate,
                BookedAt = now, Total = total, Discount = discount, Paid = f.PaidAmount, PaymentMode = f.PaymentMode, CreatedBy = user.UserId,
                Tests = f.Tests.DistinctBy(t => t.TestId).Select(t =>
                {
                    var test = tests.First(x => x.Id == t.TestId);
                    return new BookingTest
                    {
                        TestId = test.Id, DepartmentId = test.DepartmentId, Price = test.Price, BookedAt = now, Status = BookingStatus.Registered,
                        IsOutsource = t.IsOutsource, OutsourceLabId = t.OutsourceLabId, OutsourceStatus = OutsourceStatus.Pending
                    };
                }).ToList()
            };
            var payment = f.PaidAmount > 0
                ? new BookingPayment { Amount = f.PaidAmount, Mode = f.PaymentMode, PaidAt = now, ReceivedBy = user.UserId } : null;

            await repo.AddAsync(newPatient, booking, payment, ct);
            await repo.UpsertSummaryAsync(user.CenterId, now, f.PaidAmount, net - f.PaidAmount, ct);
            await repo.AuditAsync(user.UserId, "create", "booking", booking.Id.ToString(), ct);
            return new BookingCreatedVm(booking.Id, labNo, billNo, uid, total, discount, f.PaidAmount, net - f.PaidAmount);
        }, ct);

        cache.Remove($"dash:{tenant.Id}:{user.CenterId}");     // next dashboard load is fresh
        return result;
    }
}
