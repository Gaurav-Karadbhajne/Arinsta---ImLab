using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using ImLab.Models.Enums;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;
using Microsoft.Extensions.Caching.Memory;

namespace ImLab.Models.Services;

public sealed class BookingService(BookingRepository repo, ICurrentUser user, ITenantContext tenant, IMemoryCache cache)
{
    // Old simple catalog - kept so nothing else breaks; the registration screen uses RegistrationDataAsync.
    public Task<List<TestPickerItem>> CatalogAsync(CancellationToken ct) =>
        cache.GetOrCreateAsync($"catalog:{tenant.Id}", e => { e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10); return repo.GetCatalogAsync(ct); })!;

    /// <summary>One cached call fills the whole registration screen (departments+tests, packages, doctors, hospitals, collectors).</summary>
    public Task<RegistrationDataVm> RegistrationDataAsync(CancellationToken ct) =>
        cache.GetOrCreateAsync($"regdata:{tenant.Id}", e => { e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10); return repo.GetRegistrationDataAsync(ct); })!;

    // Quick-add (+) inserts the row, then busts the cached registration data so the dropdown shows it immediately.
    public async Task<MasterOption> AddDoctorAsync(QuickAdd q, CancellationToken ct) { var o = await repo.AddDoctorAsync(q, ct); cache.Remove($"regdata:{tenant.Id}"); return o; }
    public async Task<MasterOption> AddHospitalAsync(QuickAdd q, CancellationToken ct) { var o = await repo.AddHospitalAsync(q, ct); cache.Remove($"regdata:{tenant.Id}"); return o; }
    public async Task<MasterOption> AddCollectorAsync(QuickAdd q, CancellationToken ct) { var o = await repo.AddCollectorAsync(q, ct); cache.Remove($"regdata:{tenant.Id}"); return o; }

    public Task<PagedResult<BookingRowVm>> SearchAsync(BookingQuery q, CancellationToken ct) => repo.SearchAsync(user.CenterId, q, ct);


    /// <summary>Stat cards for the current filters. Cached 30s behind a versioned key; money actions bump the version.</summary>
    public async Task<BookingStatsVm> StatsAsync(BookingQuery q, CancellationToken ct)
    {
        var versionKey = $"bookstatsver:{tenant.Id}:{user.CenterId}";
        var version = cache.Get<int?>(versionKey) ?? 0;
        // AfterId is excluded: the cards describe the whole filtered set, not the loaded page.
        var key = $"bookstats:{tenant.Id}:{user.CenterId}:{version}:{q with { AfterId = null }}";

        return await cache.GetOrCreateAsync(key, e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return repo.StatsAsync(user.CenterId, q, ct);
        }) ?? new BookingStatsVm(0, 0, 0, 0, 0, 0, 0);
    }

    // Filter dropdown values change rarely; cached 5 minutes.
    public Task<FilterOptionsVm> FilterOptionsAsync(CancellationToken ct) =>
        cache.GetOrCreateAsync($"filters:{tenant.Id}:{user.CenterId}", e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            return repo.FilterOptionsAsync(user.CenterId, ct);
        })!;

    public async Task<BookingDetailVm> DetailAsync(long id, CancellationToken ct)
    {
        var d = await repo.GetDetailAsync(user.CenterId, id, ct);
        return d ?? throw new AppException(404, "Booking not found.");
    }

    public async Task<ReceiptListVm> ReceiptListAsync(long id, CancellationToken ct)
    {
        var r = await repo.GetReceiptListAsync(user.CenterId, id, ct);
        return r ?? throw new AppException(404, "Booking not found.");
    }

    public async Task<PatientMatchVm> PatientForRebookAsync(long patientId, CancellationToken ct)
    {
        var p = await repo.GetPatientForRebookAsync(user.CenterId, patientId, ct);
        return p ?? throw new AppException(404, "Patient not found.");
    }


    // ---- Search page actions -----------------------------------------------------------

    /// <summary>Any money/edit action invalidates the stat cards, filter lists and dashboard.</summary>
    private void BumpBookingCaches()
    {
        cache.Remove($"dash:{tenant.Id}:{user.CenterId}");
        cache.Remove($"filters:{tenant.Id}:{user.CenterId}");
        var key = $"bookstatsver:{tenant.Id}:{user.CenterId}";
        cache.Set(key, (cache.Get<int?>(key) ?? 0) + 1);
    }

    public async Task<CollectResultVm> CollectAsync(long id, CollectForm f, CancellationToken ct)
    {
        var r = await repo.CollectAsync(user.CenterId, id, user.UserId, user.MaxDiscountPercent, f, ct);
        BumpBookingCaches();
        return r;
    }

    public async Task<RefundResultVm> RefundAsync(long id, RefundForm f, CancellationToken ct)
    {
        var r = await repo.RefundAsync(user.CenterId, id, user.UserId, f, ct);
        BumpBookingCaches();
        return r;
    }

    /// <summary>Validates and prices new lines exactly like registration, then lets the repo save them.</summary>
    public async Task<AddTestsResultVm> AddTestsAsync(long id, AddTestsForm f, CancellationToken ct)
    {
        var requested = f.Tests ?? new List<BookingLineInput>();
        var packageIds = (f.PackageIds ?? new List<long>()).Distinct().ToList();
        if (requested.Count == 0 && packageIds.Count == 0)
            throw new AppException(400, "Pick at least one test or package.");

        var packages = await repo.GetPackagesAsync(packageIds, ct);
        if (packages.Count != packageIds.Count) throw new AppException(400, "One or more packages are not available.");

        requested = requested.DistinctBy(l => (l.TestId, l.PackageId)).ToList();
        var lineIds = requested.Select(t => t.TestId).Distinct().ToList();
        var picked = await repo.GetTestsAsync(lineIds, ct);
        if (picked.Count != lineIds.Count) throw new AppException(400, "One or more tests are not available.");

        var components = await repo.GetPackageComponentsAsync(packageIds, ct);
        var extra = await repo.GetTestsAsync(components.Select(c => c.TestId).Distinct().Except(lineIds), ct);
        var all = picked.Concat(extra).ToDictionary(t => t.Id);

        var addedTotal = requested.Sum(l => l.Price ?? all[l.TestId].Price) + packages.Sum(p => p.Price);
        var now = DateTime.UtcNow;

        var lines = requested.Select(l =>
        {
            var t = all[l.TestId];
            return new BookingTest
            {
                TestId = t.Id,
                DepartmentId = t.DepartmentId,
                Price = l.Price ?? t.Price,
                PackageId = l.PackageId,
                SampleCollected = l.SampleCollected,
                BookedAt = now,
                Status = BookingStatus.Registered,
                OutsourceStatus = OutsourceStatus.Pending
            };
        }).ToList();

        lines.AddRange(packages.SelectMany(p => components.Where(c => c.PackageId == p.Id).Select(c =>
        {
            var t = all[c.TestId];
            return new BookingTest
            {
                TestId = t.Id,
                DepartmentId = t.DepartmentId,
                Price = 0,
                PackageId = p.Id,
                BookedAt = now,
                Status = BookingStatus.Registered,
                OutsourceStatus = OutsourceStatus.Pending
            };
        })));

        var packageLines = packages.Select(p => new BookingPackage { PackageId = p.Id, Name = p.Name, Price = p.Price }).ToList();
        var result = await repo.AddTestsAsync(user.CenterId, id, user.UserId, lines, packageLines, addedTotal, f.PaidAmount, f.PaymentMode, ct);
        BumpBookingCaches();
        return result;
    }

    /// <summary>Every delete needs a real reason; it is shown in the Delete Log.</summary>
    private static string RequireReason(string? reason)
    {
        var r = (reason ?? "").Trim();
        if (r.Length < 3) throw new AppException(400, "Delete reason must be at least 3 characters.");
        if (r.Length > 300) throw new AppException(400, "Delete reason is too long (max 300 characters).");
        return r;
    }

    public async Task DeleteBookingAsync(long id, string reason, CancellationToken ct)
    {
        await repo.DeleteAsync(user.CenterId, id, user.UserId, RequireReason(reason), ct);
        BumpBookingCaches();
    }

    public async Task RestoreBookingAsync(long id, CancellationToken ct)
    {
        await repo.RestoreBookingAsync(user.CenterId, id, user.UserId, ct);
        BumpBookingCaches();
    }

    public async Task DeleteTestAsync(long testId, string reason, CancellationToken ct)
    {
        await repo.DeleteTestAsync(user.CenterId, testId, user.UserId, RequireReason(reason), ct);
        BumpBookingCaches();
    }

    public async Task RestoreTestAsync(long testId, CancellationToken ct)
    {
        await repo.RestoreTestAsync(user.CenterId, testId, user.UserId, ct);
        BumpBookingCaches();
    }

    public async Task DeletePackageAsync(long packageId, string reason, CancellationToken ct)
    {
        await repo.DeletePackageAsync(user.CenterId, packageId, user.UserId, RequireReason(reason), ct);
        BumpBookingCaches();
    }

    public async Task RestorePackageAsync(long packageId, CancellationToken ct)
    {
        await repo.RestorePackageAsync(user.CenterId, packageId, user.UserId, ct);
        BumpBookingCaches();
    }

    public async Task DeletePaymentAsync(long paymentId, string reason, CancellationToken ct)
    {
        await repo.DeletePaymentAsync(user.CenterId, paymentId, user.UserId, RequireReason(reason), ct);
        BumpBookingCaches();
    }

    public async Task RestorePaymentAsync(long paymentId, CancellationToken ct)
    {
        await repo.RestorePaymentAsync(user.CenterId, paymentId, user.UserId, ct);
        BumpBookingCaches();
    }

    public Task<PagedResult<DeletedRowVm>> DeleteLogAsync(DeleteLogQuery q, CancellationToken ct) =>
        repo.GetDeleteLogAsync(user.CenterId, q, ct);

    public async Task UpdatePatientAsync(long patientId, PatientEditForm f, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(f.FirstName)) throw new AppException(400, "First name is required.");
        if (string.IsNullOrWhiteSpace(f.Gender)) throw new AppException(400, "Gender is required.");
        if (f.AgeYears < 0 || f.AgeMonths < 0 || f.AgeDays < 0) throw new AppException(400, "Age cannot be negative.");
        await repo.UpdatePatientAsync(user.CenterId, patientId, user.UserId, f, ct);
        BumpBookingCaches();
    }

    public async Task UpdateMetaAsync(long id, BookingMetaForm f, CancellationToken ct)
    {
        await repo.UpdateMetaAsync(user.CenterId, id, user.UserId, f, ct);
        BumpBookingCaches();
    }

    public Task<PaymentReceiptVm?> PaymentReceiptAsync(long paymentId, CancellationToken ct) =>
        repo.GetPaymentReceiptAsync(user.CenterId, paymentId, tenant.CompanyName, ct);



    public Task<PagedResult<OutsourceRowVm>> OutsourceAsync(OutsourceQuery q, CancellationToken ct) => repo.OutsourceAsync(user.CenterId, q, ct);
    public Task<ReceiptVm?> ReceiptAsync(long id, CancellationToken ct) => repo.GetReceiptAsync(user.CenterId, id, tenant.CompanyName, ct);

    /// <summary>Rebook lookup: same-mobile / same-name patients with recent visits for the popup.</summary>
    public Task<List<PatientMatchVm>> LookupPatientsAsync(string? mobile, string? name, CancellationToken ct) =>
        repo.FindPatientsAsync(user.CenterId, mobile, name, ct);

    public async Task<BookingCreatedVm> CreateAsync(BookingForm f, CancellationToken ct)
    {
        if (f.DiscountPercent > user.MaxDiscountPercent) throw new AppException(403, $"Your role allows a discount of up to {user.MaxDiscountPercent}%.");

        // --- every referenced entity must exist and be active ---
        var packageIds = f.PackageIds.Distinct().ToList();
        var packages = await repo.GetPackagesAsync(packageIds, ct);
        if (packages.Count != packageIds.Count) throw new AppException(400, "One or more packages are not available.");

        var lineIds = f.Tests.Select(t => t.TestId).Distinct().ToList();
        var picked = await repo.GetTestsAsync(lineIds, ct);
        if (picked.Count != lineIds.Count) throw new AppException(400, "One or more tests are not available.");

        // Package components become worklist rows too (price 0); fetch any the user didn't also pick individually.
        var components = await repo.GetPackageComponentsAsync(packageIds, ct);
        var componentIds = components.Select(c => c.TestId).Distinct().ToList();
        var extra = await repo.GetTestsAsync(componentIds.Except(lineIds), ct);
        var all = picked.Concat(extra).ToDictionary(t => t.Id);




        // --- money: individual lines (manual price allowed) + one charge per package ---
        var total = f.Tests.Sum(l => l.Price ?? all[l.TestId].Price) + packages.Sum(p => p.Price);
        var (_, pctDiscount, _) = BookingTotals.Calc([total], f.DiscountPercent);
        // Discount: amount mode wins when sent; always clamp to the bill and the role's ceiling.
        var ceiling = BookingTotals.Calc([total], user.MaxDiscountPercent).Discount;
        var discount = Math.Min(f.DiscountAmount is > 0 ? Math.Min(f.DiscountAmount.Value, total) : pctDiscount, ceiling);
        var net = total - discount;
                if (f.PaidAmount > net)
            throw new AppException(400, $"Collected amount cannot be more than the bill total. You can collect at most ₹{Math.Max(0, net):0.00} now.");

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
                    Uid = uid,
                    Title = f.Title,
                    FirstName = f.FirstName.Trim(),
                    LastName = f.LastName?.Trim(),
                    Gender = f.Gender,
                    AgeYears = f.AgeYears,
                    AgeMonths = f.AgeMonths,
                    AgeDays = f.AgeDays,
                    Mobile = f.Mobile,
                    Email = f.Email,
                    Address = f.Address,
                    CreatedAt = DateTime.UtcNow
                };
            }
            var now = DateTime.UtcNow;
            var labNo = await repo.NextNumberAsync("lab_no", ct);
            var billSeq = await repo.NextNumberAsync("bill_no", ct);
            var billNo = $"B{DateTime.UtcNow:yy}{billSeq:D6}";
            var token = await repo.NextTokenAsync(user.CenterId, IndianTime.Today, ct);

            // The front desk may backdate a booking (late-evening entry etc.); the clock time stays
            // the IST time of entry, so "today at 3 pm" for a past date still prints 3 pm.
            var bookedAt = f.BookingDate is DateOnly bd
                ? IndianTime.ToUtc(bd.ToDateTime(TimeOnly.FromDateTime(IndianTime.FromUtc(now))))
                : now;

            var doctorName = f.ReferralDoctorId is long did ? await repo.GetDoctorNameAsync(did, ct) : null;
            var hospitalName = f.HospitalId is long hid ? await repo.GetHospitalNameAsync(hid, ct) : null;

            var booking = new Booking
            {
                LabNo = labNo,
                BillNo = billNo,
                TokenNo = token,
                IsRebook = f.PatientId.HasValue,
                PatientId = f.PatientId ?? 0,
                CenterId = user.CenterId,
                PatientType = f.PatientType,
                ReferralDoctor = doctorName,
                Corporate = hospitalName,
                Remark = f.Remark,
                SampleCollectorId = f.SampleCollectorId,
                CollectorFee = f.CollectorFee,
                DeliveryMode = f.DeliveryMode,
                DiscountRemark = f.DiscountRemark,
                BookedAt = bookedAt,
                Total = total,
                Discount = discount,
                Paid = f.PaidAmount,
                PaymentMode = f.PaymentMode,
                CreatedBy = user.UserId,
                Tests = BuildLines(f, packages, components, all, bookedAt),
            };
            var bookingPackages = packages.Select(p => new BookingPackage { PackageId = p.Id, Name = p.Name, Price = p.Price }).ToList();
            // The advance is a real payment too: give it its own receipt number (series seeded by 05_search.sql).
            string? receiptNo = null;
            if (f.PaidAmount > 0)
            {
                var receiptSeq = await repo.NextNumberAsync("receipt_no", ct);
                receiptNo = $"R{DateTime.UtcNow:yy}{receiptSeq:D6}";
            }
            var payment = f.PaidAmount > 0
                ? new BookingPayment { Amount = f.PaidAmount, Mode = f.PaymentMode, PaidAt = bookedAt, ReceivedBy = user.UserId, ReceiptNo = receiptNo } : null;

            await repo.AddAsync(newPatient, booking, payment, bookingPackages, ct);
            // Daily figures belong to the lab's IST day, never the server's UTC day.
            await repo.UpsertSummaryAsync(user.CenterId, IndianTime.FromUtc(now), f.PaidAmount, net - f.PaidAmount, ct);
            await repo.AuditAsync(user.UserId, "create", "booking", booking.Id.ToString(), ct);
            return new BookingCreatedVm(booking.Id, labNo, billNo, uid, total, discount, f.PaidAmount, net - f.PaidAmount, token);
        }, ct);

        cache.Remove($"dash:{tenant.Id}:{user.CenterId}");     // next dashboard load is fresh
        return result;
    }

    /// <summary>Individual picked lines (price override + sample flag) plus package component lines (price 0 - the package line carries the charge).</summary>
    private static List<BookingTest> BuildLines(BookingForm f, List<Package> packages, List<PackageTest> components, Dictionary<long, Test> all, DateTime now) =>
        f.Tests.DistinctBy(l => (l.TestId, l.PackageId)).Select(l =>
        {
            var t = all[l.TestId];
            return new BookingTest
            {
                TestId = t.Id,
                DepartmentId = t.DepartmentId,
                Price = l.Price ?? t.Price,
                PackageId = l.PackageId,
                SampleCollected = l.SampleCollected,
                BookedAt = now,
                Status = BookingStatus.Registered,
                OutsourceStatus = OutsourceStatus.Pending
            };
        })
        .Concat(packages.SelectMany(p => components.Where(c => c.PackageId == p.Id).Select(c =>
        {
            var t = all[c.TestId];
            return new BookingTest
            {
                TestId = t.Id,
                DepartmentId = t.DepartmentId,
                Price = 0,
                PackageId = p.Id,
                BookedAt = now,
                Status = BookingStatus.Registered,
                OutsourceStatus = OutsourceStatus.Pending
            };
        })))
        .ToList();
}