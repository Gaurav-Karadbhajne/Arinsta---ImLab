using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using ImLab.Models.Enums;
using ImLab.Models.ViewModels;
using Microsoft.EntityFrameworkCore;
using ImLab.Models.Services;   // AppException: repo rules surface as HTTP 400/403/404

namespace ImLab.Models.Repositories;

// All database access for registration (data + save), booking search, outsource and receipts.
public sealed class BookingRepository(TenantDbContext db)
{
        // Simple flat catalog (kept for the older screens); the registration page uses GetRegistrationDataAsync below.
    public Task<List<TestPickerItem>> GetCatalogAsync(CancellationToken ct) =>
        db.Tests.Where(t => t.IsActive).OrderBy(t => t.SortOrder)
          .Join(db.Departments, t => t.DepartmentId, d => d.Id, (t, d) => new TestPickerItem(t.Id, t.Name, t.ShortName, t.Price, d.Name))
          .ToListAsync(ct);
    // ---- registration screen data ------------------------------------------------------

    /// <summary>Everything the registration page needs, in one cached call.</summary>
    public async Task<RegistrationDataVm> GetRegistrationDataAsync(CancellationToken ct)
    {
        var departments = await GetRegDepartmentsAsync(ct);
        var packages = await GetRegPackagesAsync(ct);
        var doctors = await GetDoctorsAsync(ct);
        var hospitals = await GetHospitalsAsync(ct);
        var collectors = await GetCollectorsAsync(ct);
        return new RegistrationDataVm(departments, packages, doctors, hospitals, collectors);
    }

    /// <summary>Departments with their active tests - the left + middle columns of the registration screen.</summary>
    public async Task<List<RegDepartmentVm>> GetRegDepartmentsAsync(CancellationToken ct)
    {
        var rows = await (from d in db.Departments
                          where d.IsActive
                          from t in db.Tests
                          where t.DepartmentId == d.Id && t.IsActive
                          orderby d.SortOrder, t.SortOrder
                          select new { d.Id, d.Name, Test = new RegTestItem(t.Id, t.Name, t.ShortName, t.Price, t.SampleType) }).ToListAsync(ct);
        return rows.GroupBy(r => new { r.Id, r.Name })
                   .Select(g => new RegDepartmentVm(g.Key.Id, g.Key.Name, g.Select(x => x.Test).ToList())).ToList();
    }

    /// <summary>Packages with component tests - the Packages tab.</summary>
    public async Task<List<RegPackageVm>> GetRegPackagesAsync(CancellationToken ct)
    {
        var rows = await (from p in db.Packages
                          where p.IsActive
                          from pt in db.PackageTests
                          where pt.PackageId == p.Id
                          join t in db.Tests on pt.TestId equals t.Id
                          where t.IsActive
                          orderby p.SortOrder, t.SortOrder
                          select new { p.Id, p.Name, p.Price, Test = new RegTestItem(t.Id, t.Name, t.ShortName, t.Price, t.SampleType) }).ToListAsync(ct);
        return rows.GroupBy(r => new { r.Id, r.Name, r.Price })
                   .Select(g => new RegPackageVm(g.Key.Id, g.Key.Name, g.Key.Price, g.Select(x => x.Test).ToList())).ToList();
    }

       public Task<List<MasterOption>> GetDoctorsAsync(CancellationToken ct) =>
        db.ReferralDoctors.Where(d => d.IsActive).OrderBy(d => d.Name)
          .Select(d => new MasterOption(d.Id, d.Degree != null && d.Degree.Length > 0 ? d.Name + ", " + d.Degree : d.Name, d.Mobile)).ToListAsync(ct);
    public Task<List<MasterOption>> GetHospitalsAsync(CancellationToken ct) =>
        db.Hospitals.Where(h => h.IsActive).OrderBy(h => h.Name).Select(h => new MasterOption(h.Id, h.Name, h.Mobile)).ToListAsync(ct);
    public Task<List<MasterOption>> GetCollectorsAsync(CancellationToken ct) =>
        db.SampleCollectors.Where(c => c.IsActive).OrderBy(c => c.Name).Select(c => new MasterOption(c.Id, c.Name, c.Mobile)).ToListAsync(ct);

    /// <summary>Quick-add (+) on the registration screen: insert and hand back the new dropdown option.</summary>
    public async Task<MasterOption> AddDoctorAsync(QuickAdd q, CancellationToken ct)
    {
        var d = new ReferralDoctor { Name = q.Name.Trim(),Degree = q.Degree, Mobile = q.Mobile, Hospital = q.Extra };
        db.ReferralDoctors.Add(d); await db.SaveChangesAsync(ct);
        return new MasterOption(d.Id, d.Name, d.Mobile);
    }
    public async Task<MasterOption> AddHospitalAsync(QuickAdd q, CancellationToken ct)
    {
        var h = new Hospital { Name = q.Name.Trim(), Mobile = q.Mobile };
        db.Hospitals.Add(h); await db.SaveChangesAsync(ct);
        return new MasterOption(h.Id, h.Name, h.Mobile);
    }
    public async Task<MasterOption> AddCollectorAsync(QuickAdd q, CancellationToken ct)
    {
        var c = new SampleCollector { Name = q.Name.Trim(), Mobile = q.Mobile };
        db.SampleCollectors.Add(c); await db.SaveChangesAsync(ct);
        return new MasterOption(c.Id, c.Name, c.Mobile);
    }

    // ---- booking save ------------------------------------------------------------------

    public Task<List<Test>> GetTestsAsync(IEnumerable<long> ids, CancellationToken ct) =>
        db.Tests.Where(t => ids.Contains(t.Id) && t.IsActive).ToListAsync(ct);

    public Task<List<Package>> GetPackagesAsync(IEnumerable<long> ids, CancellationToken ct) =>
        db.Packages.Where(p => ids.Contains(p.Id) && p.IsActive).ToListAsync(ct);

    /// <summary>Component test ids of the chosen packages (each becomes a worklist row with price 0).</summary>
    public Task<List<PackageTest>> GetPackageComponentsAsync(IEnumerable<long> packageIds, CancellationToken ct) =>
        db.PackageTests.Where(pt => packageIds.Contains(pt.PackageId)).ToListAsync(ct);

    // The bill stores doctor/hospital NAMES (they can be renamed later; the printed bill must not change).
    public Task<string?> GetDoctorNameAsync(long id, CancellationToken ct) =>
        db.ReferralDoctors.Where(d => d.Id == id).Select(d => d.Name).FirstOrDefaultAsync(ct);
    public Task<string?> GetHospitalNameAsync(long id, CancellationToken ct) =>
        db.Hospitals.Where(h => h.Id == id).Select(h => h.Name).FirstOrDefaultAsync(ct);

    public Task<Patient?> GetPatientAsync(long id, CancellationToken ct) => db.Patients.FirstOrDefaultAsync(p => p.Id == id, ct);
    /// <summary>Rebook lookup: patients matching an exact mobile or a name prefix, each with visit count + last 5 bookings (this center).</summary>
public async Task<List<PatientMatchVm>> FindPatientsAsync(long centerId, string? mobile, string? name, CancellationToken ct)
{
    mobile = string.IsNullOrWhiteSpace(mobile) ? null : mobile.Trim();
    name = string.IsNullOrWhiteSpace(name) ? null : name.Trim();
    if (mobile is null && name is null) return [];

    var q = db.Patients.AsQueryable();
    if (mobile is not null) q = q.Where(p => p.Mobile == mobile);
    if (name is not null) q = q.Where(p => p.FirstName.StartsWith(name) || (p.LastName ?? "").StartsWith(name));

    var patients = await q.OrderByDescending(p => p.Id).Take(10)
        .Select(p => new { p.Id, p.Uid, p.Title, p.FirstName, p.LastName, p.Gender, p.AgeYears, p.AgeMonths, p.AgeDays, p.Mobile, p.Email, p.Address })
        .ToListAsync(ct);
    var ids = patients.Select(p => p.Id).ToList();

    // Bookings for the matched patients at this center, newest first - the popup's history.
    var visits = await db.Bookings.Where(b => b.CenterId == centerId && !b.IsDeleted && ids.Contains(b.PatientId))
        .OrderByDescending(b => b.Id)
        .Select(b => new { b.PatientId, b.Id, b.LabNo, b.BillNo, b.BookedAt, b.Total, b.Discount, b.Paid })
        .ToListAsync(ct);

    return patients.Select(p =>
    {
        var mine = visits.Where(v => v.PatientId == p.Id).ToList();
        return new PatientMatchVm(p.Id, p.Uid, p.Title, p.FirstName, p.LastName, p.Gender, p.AgeYears, p.AgeMonths, p.AgeDays,
            p.Mobile, p.Email, p.Address,
            mine.FirstOrDefault()?.BookedAt, mine.Count,
            mine.Take(5).Select(v => new PatientVisitVm(v.Id, v.LabNo, v.BillNo, v.BookedAt, v.Total - v.Discount, v.Total - v.Discount - v.Paid)).ToList());
    }).ToList();
}

    /// <summary>Walk-in token: this center's position in today's queue (computed inside the booking transaction).</summary>
    /// <summary>Walk-in token: this center's position in the chosen day's queue (inside the booking transaction).</summary>
    public async Task<int> NextTokenAsync(long centerId, DateOnly day, CancellationToken ct)
    {
        var start = IndianTime.ToUtc(day.ToDateTime(TimeOnly.MinValue));
        var end = IndianTime.ToUtc(day.AddDays(1).ToDateTime(TimeOnly.MinValue));
        var count = await db.Bookings.CountAsync(b => b.CenterId == centerId && b.BookedAt >= start && b.BookedAt < end, ct);
        return count + 1;
    }

    /// <summary>Runs the work in one transaction, retry-safe with the MySQL execution strategy.</summary>
    public Task<T> InTransactionAsync<T>(Func<Task<T>> work, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var result = await work();
            await tx.CommitAsync(ct);
            return result;
        });

    /// <summary>Next number of a series without a race between users.</summary>
    public async Task<long> NextNumberAsync(string key, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE number_series SET current_no = LAST_INSERT_ID(current_no + 1) WHERE series_key = {key}", ct);
        return await db.Database.SqlQuery<long>($"SELECT CAST(LAST_INSERT_ID() AS SIGNED) AS Value").SingleAsync(ct);
    }

    /// <summary>Saves patient -> booking -> package lines -> payment, in that order (children need the booking id).</summary>
    public async Task AddAsync(Patient? newPatient, Booking booking, BookingPayment? payment, List<BookingPackage> packages, CancellationToken ct)
    {
        if (newPatient is not null) { db.Patients.Add(newPatient); await db.SaveChangesAsync(ct); booking.PatientId = newPatient.Id; }
        booking.Patient = null!;
        db.Bookings.Add(booking);
        await db.SaveChangesAsync(ct);
        if (packages.Count > 0)
        {
            foreach (var p in packages) p.BookingId = booking.Id;
            db.BookingPackages.AddRange(packages);
            await db.SaveChangesAsync(ct);
        }
        if (payment is not null) { payment.BookingId = booking.Id; db.BookingPayments.Add(payment); await db.SaveChangesAsync(ct); }
    }

    public Task UpsertSummaryAsync(long centerId, DateTime day, decimal paid, decimal balance, CancellationToken ct)
    {
        var d = day.Date.ToString("yyyy-MM-dd");
        return db.Database.ExecuteSqlInterpolatedAsync(
            $@"INSERT INTO daily_summary (center_id, summary_date, bookings, revenue, outstanding) VALUES ({centerId}, {d}, 1, {paid}, {balance})
               ON DUPLICATE KEY UPDATE bookings = bookings + 1, revenue = revenue + VALUES(revenue), outstanding = outstanding + VALUES(outstanding)", ct);
    }

    public Task AuditAsync(long userId, string action, string entity, string entityId, CancellationToken ct)
    {
        db.AuditLog.Add(new AuditLog { UserId = userId, Action = action, Entity = entity, EntityId = entityId, CreatedAt = DateTime.UtcNow });
        return db.SaveChangesAsync(ct);
    }

    // ---- search / outsource / receipt ---------------------------------------------------

    /// <summary>Keyset paging: newest first, cheap at any depth.</summary>
       // ---- search / stats / filters ------------------------------------------------------

    /// <summary>All search filters live here once, so the grid and the stat cards can never drift apart.
    /// With no filters the whole Search page is scoped to today; any filter takes over.</summary>
    private IQueryable<Booking> Filtered(long centerId, BookingQuery q)
    {
        var query = db.Bookings.Where(b => b.CenterId == centerId && !b.IsDeleted);

        // A user may only ever see their own center; asking for another one returns nothing.
        if (q.CenterId is long cid && cid != centerId) query = query.Where(b => b.Id < 0);

        // Search opens on today's visits. CenterId does not count as a filter: a user only ever has
        // one center, and picking it would otherwise silently widen the page to every date.
        if (!HasFilters(q))
        {
            // booked_at is stored UTC; "today" is the lab's IST day, like the date pickers.
            var today = IndianTime.Today;
            var dayStart = IndianTime.ToUtc(today.ToDateTime(TimeOnly.MinValue));
            var dayEnd = IndianTime.ToUtc(today.AddDays(1).ToDateTime(TimeOnly.MinValue));
            query = query.Where(b => b.BookedAt >= dayStart && b.BookedAt < dayEnd);
        }

        if (!string.IsNullOrWhiteSpace(q.Mobile))
        {
            var m = q.Mobile.Trim();
            query = query.Where(b => b.Patient.Mobile == m);
        }
        if (!string.IsNullOrWhiteSpace(q.Corporate))
        {
            var c = q.Corporate.Trim();
            query = query.Where(b => b.Corporate == c);
        }
        if (!string.IsNullOrWhiteSpace(q.ReferralDoctor))
        {
            var d = q.ReferralDoctor.Trim();
            query = query.Where(b => b.ReferralDoctor == d);
        }
        if (q.OutstandingOnly) query = query.Where(b => b.Balance > 0);
        if (q.From is DateTimeOffset from) query = query.Where(b => b.BookedAt >= from.UtcDateTime);
        if (q.To is DateTimeOffset to) query = query.Where(b => b.BookedAt < to.UtcDateTime);

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            // Digits: lab number or mobile. Text: UID / bill no / mobile / first or last name prefix.
            // Prefix (StartsWith) is deliberate - it uses the index; Contains would scan every row.
            if (long.TryParse(s, out var n))
                query = query.Where(b => b.LabNo == n || b.Patient.Mobile == s);
            else
                query = query.Where(b =>
                    b.Patient.Uid == s || b.BillNo == s || b.Patient.Mobile == s ||
                    b.Patient.FirstName.StartsWith(s) ||
                    (b.Patient.LastName != null && b.Patient.LastName.StartsWith(s)));
        }
        return query;
    }

    /// <summary>True when the user narrowed the page - any filter removes the today-only default.</summary>
    private static bool HasFilters(BookingQuery q) =>
        !string.IsNullOrWhiteSpace(q.Search) || !string.IsNullOrWhiteSpace(q.Mobile) ||
        !string.IsNullOrWhiteSpace(q.Corporate) || !string.IsNullOrWhiteSpace(q.ReferralDoctor) ||
        q.OutstandingOnly || q.From is not null || q.To is not null;

    /// <summary>Keyset paging: newest first, cheap at any depth (no OFFSET scan).</summary>
    public async Task<PagedResult<BookingRowVm>> SearchAsync(long centerId, BookingQuery q, CancellationToken ct)
    {
        var size = Math.Clamp(q.PageSize, 1, 200);
        var query = Filtered(centerId, q);
        if (q.AfterId is long after) query = query.Where(b => b.Id < after);

        var rows = await query.OrderByDescending(b => b.Id).Take(size + 1)
            .Select(b => new BookingRowVm(b.Id, b.LabNo,
                ((b.Patient.Title ?? "") + " " + b.Patient.FirstName + " " + (b.Patient.LastName ?? "")).Trim(),
                b.Patient.Uid, b.Patient.AgeYears, b.Patient.Gender, b.ReferralDoctor,
                b.Total - b.Discount, b.Balance, b.BookedAt,
                b.Patient.Mobile, b.Corporate, b.Paid, b.PatientId, b.IsRebook))
            .ToListAsync(ct);

        return new PagedResult<BookingRowVm>(rows.Take(size).ToList(), rows.Count > size);
    }

    /// <summary>One aggregate query for the six cards. Uses the stored balance column + its index.
    /// Everything follows Filtered, so the cards share the grid's today-by-default scope.</summary>
    public async Task<BookingStatsVm> StatsAsync(long centerId, BookingQuery q, CancellationToken ct)
    {
        var s = await Filtered(centerId, q)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Bookings = g.Count(),
                FullyPaid = g.Count(b => b.Balance <= 0),
                PartPaid = g.Count(b => b.Paid > 0 && b.Balance > 0),
                Outstanding = g.Count(b => b.Balance > 0),
                OutstandingAmount = g.Sum(b => b.Balance > 0 ? b.Balance : 0),
                Collected = g.Sum(b => b.Paid)
            })
            .FirstOrDefaultAsync(ct);

        return s is null
            ? new BookingStatsVm(0, 0, 0, 0, 0, 0, 0)
            : new BookingStatsVm(s.Bookings, s.FullyPaid, s.PartPaid, s.Outstanding, s.OutstandingAmount, s.Collected, s.Bookings);
    }

    /// <summary>Filter dropdown values. Centers are limited to the signed-in user's center (row security).</summary>
    public async Task<FilterOptionsVm> FilterOptionsAsync(long centerId, CancellationToken ct)
    {
        var centers = await db.Centers.Where(c => c.Id == centerId)
            .Select(c => new MasterOption(c.Id, c.Name, null)).ToListAsync(ct);

        // Distinct values straight from bookings use the new (center, is_deleted, corporate, id) indexes.
        var corporates = await db.Bookings
            .Where(b => b.CenterId == centerId && !b.IsDeleted && b.Corporate != null && b.Corporate != "")
            .Select(b => b.Corporate!).Distinct().OrderBy(x => x).Take(500).ToListAsync(ct);
        var doctors = await db.Bookings
            .Where(b => b.CenterId == centerId && !b.IsDeleted && b.ReferralDoctor != null && b.ReferralDoctor != "")
            .Select(b => b.ReferralDoctor!).Distinct().OrderBy(x => x).Take(500).ToListAsync(ct);

        return new FilterOptionsVm(centers, corporates, doctors);
    }

    public async Task<PagedResult<OutsourceRowVm>> OutsourceAsync(long centerId, OutsourceQuery q, CancellationToken ct)
    {
        var size = Math.Clamp(q.PageSize, 1, 200);
                var query = db.BookingTests.Where(t => t.IsOutsource && !t.IsDeleted && t.Booking.CenterId == centerId);
        if (Enum.TryParse<OutsourceStatus>(q.Status, true, out var st)) query = query.Where(t => t.OutsourceStatus == st);
        if (q.AfterId is long after) query = query.Where(t => t.Id < after);
        var rows = await query.OrderByDescending(t => t.Id).Take(size + 1)
            .Select(t => new
            {
                t.Id, t.Booking.LabNo, p = t.Booking.Patient, TestName = t.Test.Name, t.OutsourceLabId, t.OutsourceStatus, t.BookedAt
            }).ToListAsync(ct);
        var labIds = rows.Where(r => r.OutsourceLabId != null).Select(r => r.OutsourceLabId!.Value).Distinct().ToList();
        var labs = await db.OutsourceLabs.Where(l => labIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Name, ct);
        var items = rows.Take(size).Select(r => new OutsourceRowVm(r.Id, r.LabNo, $"{r.p.Title} {r.p.FirstName} {r.p.LastName}".Trim(), r.TestName,
            r.OutsourceLabId is long l && labs.TryGetValue(l, out var n) ? n : "-", r.OutsourceStatus.ToString(), r.BookedAt)).ToList();
        return new PagedResult<OutsourceRowVm>(items, rows.Count > size);
    }

    /// <summary>One call fills the View drawer: patient, booking meta, investigations, money rows, totals.</summary>
    public async Task<BookingDetailVm?> GetDetailAsync(long centerId, long bookingId, CancellationToken ct)
    {
        var b = await db.Bookings
            .Where(x => x.Id == bookingId && x.CenterId == centerId && !x.IsDeleted)
            .Select(x => new
            {
                x.Id, x.LabNo, x.BillNo, x.BookedAt, x.IsRebook, x.PatientId,
                x.Patient.Uid, x.Patient.Title, x.Patient.FirstName, x.Patient.LastName, x.Patient.Gender,
                x.Patient.AgeYears, x.Patient.AgeMonths, x.Patient.AgeDays, x.Patient.Mobile, x.Patient.Email, x.Patient.Address,
                x.ReferralDoctor, x.Corporate, x.Remark, x.PatientType, x.DeliveryMode,
                x.Total, x.Discount, x.Paid, x.DiscountRemark
            }).FirstOrDefaultAsync(ct);
        if (b is null) return null;

             var testRows = await (from t in db.BookingTests
                              join d in db.Departments on t.DepartmentId equals d.Id
                              where t.BookingId == bookingId && !t.IsDeleted
                              orderby t.Id
                              select new { t.Id, t.Test.Name, Department = d.Name, t.Price, t.Status, t.BookedAt, t.SampleCollected, t.PackageId })
                             .ToListAsync(ct);
        var lines = testRows
            .Select(t => new BookingLineVm(t.Id, t.Name, t.Department, t.Price, t.Status.ToString(), t.BookedAt, false, t.SampleCollected, t.PackageId))
            .ToList();

        // PackageId is the catalog id: the drawer groups each package's component tests under it.
        var packRows = await db.BookingPackages.Where(p => p.BookingId == bookingId && !p.IsDeleted).OrderBy(p => p.Id)
            .Select(p => new { p.Id, p.Name, p.Price, p.PackageId }).ToListAsync(ct);
        lines.AddRange(packRows.Select(p => new BookingLineVm(p.Id, p.Name, "Package", p.Price, "Registered", b.BookedAt, true, false, p.PackageId)));

        var payRows = await db.BookingPayments.Where(p => p.BookingId == bookingId && !p.IsDeleted).OrderBy(p => p.Id)
            .Select(p => new { p.Id, p.ReceiptNo, p.Kind, p.Amount, p.Mode, p.PaidAt, p.Reason, p.Remark }).ToListAsync(ct);
        var payments = payRows
            .Select(p => new BookingPaymentVm(p.Id, p.ReceiptNo ?? $"R{p.Id:D6}", p.Kind, p.Amount, p.Mode, p.PaidAt, p.Reason, p.Remark))
            .ToList();

        // Paid here means GROSS collected; refunds are their own money rows.
        var paid = payments.Where(p => p.Kind != "refund").Sum(p => p.Amount);
        var refunded = payments.Where(p => p.Kind == "refund").Sum(p => p.Amount);
        var balance = b.Total - b.Discount - (paid - refunded);

        return new BookingDetailVm(b.Id, b.LabNo, b.BillNo, b.BookedAt, b.IsRebook, b.PatientId,
            b.Uid, b.Title, b.FirstName, b.LastName, b.Gender, b.AgeYears, b.AgeMonths, b.AgeDays,
            b.Mobile, b.Email, b.Address, b.ReferralDoctor, b.Corporate, b.Remark, b.PatientType, b.DeliveryMode,
            b.Total, b.Discount, paid, refunded, balance, b.DiscountRemark, lines, payments);
    }

    /// <summary>Header + every receipt (payment and refund) of one visit, newest money row first.</summary>
    public async Task<ReceiptListVm?> GetReceiptListAsync(long centerId, long bookingId, CancellationToken ct)
    {
        var h = await db.Bookings.Where(x => x.Id == bookingId && x.CenterId == centerId && !x.IsDeleted)
            .Select(x => new
            {
                x.LabNo, x.BillNo, x.Total, x.Discount, x.Patient.Uid,
                Name = ((x.Patient.Title ?? "") + " " + x.Patient.FirstName + " " + (x.Patient.LastName ?? "")).Trim()
            }).FirstOrDefaultAsync(ct);
        if (h is null) return null;

                var rows = await db.BookingPayments.Where(p => p.BookingId == bookingId && !p.IsDeleted).OrderByDescending(p => p.Id)
            .Select(p => new { p.Id, p.ReceiptNo, p.Kind, p.Amount, p.Mode, p.PaidAt, p.Reason, p.Remark }).ToListAsync(ct);
        var receipts = rows
            .Select(p => new BookingPaymentVm(p.Id, p.ReceiptNo ?? $"R{p.Id:D6}", p.Kind, p.Amount, p.Mode, p.PaidAt, p.Reason, p.Remark))
            .ToList();

        var paid = receipts.Where(p => p.Kind != "refund").Sum(p => p.Amount);
        var refunded = receipts.Where(p => p.Kind == "refund").Sum(p => p.Amount);
        return new ReceiptListVm(bookingId, h.LabNo, h.BillNo, h.Name, h.Uid,
            h.Total, h.Discount, paid, refunded, h.Total - h.Discount - (paid - refunded), receipts);
    }

    /// <summary>Rebook button on the grid: load one existing patient with their recent visits.</summary>
    public async Task<PatientMatchVm?> GetPatientForRebookAsync(long centerId, long patientId, CancellationToken ct)
    {
        var p = await db.Patients.FirstOrDefaultAsync(x => x.Id == patientId, ct);
        if (p is null) return null;

        var visits = await db.Bookings.Where(b => b.PatientId == patientId && b.CenterId == centerId && !b.IsDeleted)
            .OrderByDescending(b => b.Id).Take(5)
            .Select(b => new PatientVisitVm(b.Id, b.LabNo, b.BillNo, b.BookedAt, b.Total - b.Discount, b.Balance))
            .ToListAsync(ct);
        var count = await db.Bookings.CountAsync(b => b.PatientId == patientId && b.CenterId == centerId && !b.IsDeleted, ct);
        if (count == 0) return null;   // patient never visited this center -> not visible here

        return new PatientMatchVm(p.Id, p.Uid, p.Title, p.FirstName, p.LastName, p.Gender, p.AgeYears, p.AgeMonths, p.AgeDays,
            p.Mobile, p.Email, p.Address, visits.FirstOrDefault()?.BookedAt, count, visits);
    }

    public async Task<ReceiptVm?> GetReceiptAsync(long centerId, long bookingId, string companyName, CancellationToken ct)
    {
               var b = await db.Bookings.Where(x => x.Id == bookingId && x.CenterId == centerId && !x.IsDeleted)
            .Select(x => new { x.Id, x.BillNo, x.LabNo, x.BookedAt, x.Total, x.Discount, x.Paid, x.PaymentMode, x.Patient , x.IsRebook}).FirstOrDefaultAsync(ct);
        if (b is null) return null;
        // Bill lines = live individual tests + live package lines.
        var lines = await db.BookingTests.Where(t => t.BookingId == bookingId && !t.IsDeleted).Select(t => new { t.Test.Name, t.Price }).ToListAsync(ct);
        var packs = await db.BookingPackages.Where(x => x.BookingId == bookingId && !x.IsDeleted).Select(x => new { x.Name, x.Price }).ToListAsync(ct);
        var all = lines.Select(l => (l.Name, l.Price)).Concat(packs.Select(p => (p.Name, p.Price))).ToList();
               return new ReceiptVm(companyName, b.BillNo, b.LabNo, b.Patient.FullName.Length > 0 ? b.Patient.FullName : b.Patient.FirstName, b.Patient.Uid, b.BookedAt,
            all, b.Total, b.Discount, b.Paid, b.PaymentMode, b.IsRebook);
    }

    // ---- money / edit / delete actions (Search page) -----------------------------------

    /// <summary>Locks the booking row inside the current transaction, then returns it tracked.</summary>
    private async Task<Booking> LockBookingAsync(long centerId, long bookingId, CancellationToken ct)
    {
        var rows = await db.Database.SqlQuery<long>(
            $"SELECT id AS Value FROM bookings WHERE id = {bookingId} AND center_id = {centerId} AND is_deleted = 0 FOR UPDATE")
            .ToListAsync(ct);
        if (rows.Count == 0) throw new AppException(404, "Booking not found.");
        return await db.Bookings.AsTracking().FirstAsync(x => x.Id == bookingId, ct);
    }

    /// <summary>Gross collected and refunded from the money rows - the source of truth.</summary>
    private async Task<(decimal Gross, decimal Refunded)> MoneyAsync(long bookingId, CancellationToken ct)
    {
                var rows = await db.BookingPayments.Where(p => p.BookingId == bookingId && !p.IsDeleted)
            .Select(p => new { p.Kind, p.Amount }).ToListAsync(ct);
        return (rows.Where(p => p.Kind != "refund").Sum(p => p.Amount),
                rows.Where(p => p.Kind == "refund").Sum(p => p.Amount));
    }

    /// <summary>Late collection/refund changes today's revenue (dashboard reads daily_summary).</summary>
    private Task AddRevenueAsync(long centerId, decimal delta, CancellationToken ct)
    {
        var d = IndianTime.Today.ToString("yyyy-MM-dd");
        return db.Database.ExecuteSqlInterpolatedAsync(
            $@"INSERT INTO daily_summary (center_id, summary_date, bookings, delivered, revenue, outstanding) VALUES ({centerId}, {d}, 0, 0, {delta}, 0)
               ON DUPLICATE KEY UPDATE revenue = revenue + VALUES(revenue)", ct);
    }

    private static string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>Collect now: optional discount + optional payment. A payment of 0 is never stored.</summary>
    public async Task<CollectResultVm> CollectAsync(long centerId, long bookingId, long userId,
        decimal maxDiscountPercent, CollectForm f, CancellationToken ct)
    {
        var amount = Math.Round(f.Amount, 2);
        var discount = Math.Round(f.DiscountAmount, 2);
        if (amount < 0 || discount < 0) throw new AppException(400, "Amounts cannot be negative.");
        if (amount == 0 && discount == 0) throw new AppException(400, "Enter a payment or a discount.");
        if (amount > 0 && string.IsNullOrWhiteSpace(f.PaymentMode)) throw new AppException(400, "Choose a payment mode.");

        return await InTransactionAsync(async () =>
        {
            var b = await LockBookingAsync(centerId, bookingId, ct);
            var (gross, refunded) = await MoneyAsync(bookingId, ct);
            var netPaid = gross - refunded;
            var balance = b.Total - b.Discount - netPaid;

            if (discount > 0)
            {
                var ceiling = Math.Round(b.Total * maxDiscountPercent / 100m, 2, MidpointRounding.AwayFromZero);
                if (b.Discount + discount > ceiling)
                    throw new AppException(403, $"Your role allows a discount of up to {maxDiscountPercent}% of the bill.");
                if (discount > balance) throw new AppException(400, "Discount is more than the balance.");
            }
                        // The money collected can never exceed the bill. `balance` already subtracts existing
            // payments and refunds, so subtracting this form's discount gives the true maximum now.
            var maxNow = Math.Max(0, balance - discount);
            if (amount > maxNow)
                throw new AppException(400, $"Collected amount cannot be more than the bill total. You can collect at most ₹{maxNow:0.00} now.");

            if (discount > 0)
            {
                b.Discount += discount;
                if (!string.IsNullOrWhiteSpace(f.DiscountRemark)) b.DiscountRemark = f.DiscountRemark.Trim();
            }

            long? paymentId = null; string? receiptNo = null;
            if (amount > 0)
            {
                // One money row -> one receipt. This is the row the Receipts page will list.
                var seq = await NextNumberAsync("receipt_no", ct);
                receiptNo = $"R{DateTime.UtcNow:yy}{seq:D6}";
                var pay = new BookingPayment
                {
                    BookingId = bookingId, Amount = amount, Mode = f.PaymentMode.Trim(), Kind = "payment",
                    PaidAt = DateTime.UtcNow, ReceivedBy = userId, ReceiptNo = receiptNo
                };
                db.BookingPayments.Add(pay);
                b.Paid = netPaid + amount;
                await db.SaveChangesAsync(ct);
                paymentId = pay.Id;
                await AddRevenueAsync(centerId, amount, ct);
            }
            else
            {
                await db.SaveChangesAsync(ct);   // discount-only save: no receipt, no payment row
            }

            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "collect", Entity = "booking", EntityId = bookingId.ToString(),
                Detail = $"payment={amount}; discount={discount}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return new CollectResultVm(paymentId, receiptNo, b.Paid, refunded, b.Total - b.Discount - b.Paid);
        }, ct);
    }

    /// <summary>Refund: positive amount, mandatory reason, never more than net collected.</summary>
    public async Task<RefundResultVm> RefundAsync(long centerId, long bookingId, long userId, RefundForm f, CancellationToken ct)
    {
        var amount = Math.Round(f.Amount, 2);
        if (amount <= 0) throw new AppException(400, "Refund amount must be more than zero.");
        if (string.IsNullOrWhiteSpace(f.Reason)) throw new AppException(400, "Refund reason is required.");

        return await InTransactionAsync(async () =>
        {
            var b = await LockBookingAsync(centerId, bookingId, ct);
            var (gross, refunded) = await MoneyAsync(bookingId, ct);
            var netPaid = gross - refunded;
            if (amount > netPaid) throw new AppException(400, "Refund is more than the amount collected.");

            var seq = await NextNumberAsync("receipt_no", ct);
            var receiptNo = $"R{DateTime.UtcNow:yy}{seq:D6}";
            db.BookingPayments.Add(new BookingPayment
            {
                BookingId = bookingId, Amount = amount, Mode = "Refund", Kind = "refund",
                PaidAt = DateTime.UtcNow, ReceivedBy = userId, ReceiptNo = receiptNo,
                Reason = f.Reason.Trim(), Remark = NullIfEmpty(f.Remark)
            });
            b.Paid = netPaid - amount;
            await db.SaveChangesAsync(ct);
            await AddRevenueAsync(centerId, -amount, ct);

            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "refund", Entity = "booking", EntityId = bookingId.ToString(),
                Detail = $"amount={amount}; reason={f.Reason.Trim()}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return new RefundResultVm(receiptNo, refunded + amount, b.Total - b.Discount - b.Paid);
        }, ct);
    }

    /// <summary>Adds already-priced test/package lines, raises the bill total, optionally collects now.</summary>
    public async Task<AddTestsResultVm> AddTestsAsync(long centerId, long bookingId, long userId,
        List<BookingTest> lines, List<BookingPackage> packages, decimal addedTotal, decimal paidAmount, string paymentMode, CancellationToken ct)
    {
        var paid = Math.Round(paidAmount, 2);
        if (paid < 0) throw new AppException(400, "Payment cannot be negative.");
        if (paid > 0 && string.IsNullOrWhiteSpace(paymentMode)) throw new AppException(400, "Choose a payment mode.");

        return await InTransactionAsync(async () =>
        {
            var b = await LockBookingAsync(centerId, bookingId, ct);
            var (gross, refunded) = await MoneyAsync(bookingId, ct);
            var netPaid = gross - refunded;
            var newBalance = b.Total + addedTotal - b.Discount - netPaid;
            if (paid > newBalance)
            throw new AppException(400, $"Collected amount cannot be more than the bill total. You can collect at most ₹{Math.Max(0, newBalance):0.00} now.");

            foreach (var l in lines) l.BookingId = bookingId;
            db.BookingTests.AddRange(lines);
            foreach (var p in packages) p.BookingId = bookingId;
            db.BookingPackages.AddRange(packages);
            b.Total += addedTotal;

            long? paymentId = null; string? receiptNo = null;
            if (paid > 0)
            {
                var seq = await NextNumberAsync("receipt_no", ct);
                receiptNo = $"R{DateTime.UtcNow:yy}{seq:D6}";
                var pay = new BookingPayment
                {
                    BookingId = bookingId, Amount = paid, Mode = paymentMode.Trim(), Kind = "payment",
                    PaidAt = DateTime.UtcNow, ReceivedBy = userId, ReceiptNo = receiptNo
                };
                db.BookingPayments.Add(pay);
                b.Paid = netPaid + paid;
                await db.SaveChangesAsync(ct);
                paymentId = pay.Id;
                await AddRevenueAsync(centerId, paid, ct);
            }
            else await db.SaveChangesAsync(ct);

            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "add-tests", Entity = "booking", EntityId = bookingId.ToString(),
                Detail = $"lines={lines.Count}; packages={packages.Count}; added={addedTotal}; paid={paid}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return new AddTestsResultVm(bookingId, b.Total, b.Discount, b.Paid, b.Total - b.Discount - b.Paid, paymentId, receiptNo);
        }, ct);
    }

    /// <summary>Soft delete only: row stays for the future Delete Log / Revert report.</summary>
    public async Task DeleteAsync(long centerId, long bookingId, long userId, string reason, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var b = await LockBookingAsync(centerId, bookingId, ct);
            b.IsDeleted = true; b.DeletedAt = DateTime.UtcNow; b.DeletedBy = userId; b.DeleteReason = reason.Trim();
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "delete", Entity = "booking", EntityId = bookingId.ToString(),
                Detail = reason.Trim(), CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    // ---- soft delete / restore: tests, packages, receipts + Delete Log -----------------

    /// <summary>Locks the visit of a test line, then returns the line tracked (with its test name).</summary>
    private async Task<(BookingTest Row, Booking Booking)> LockTestAsync(long centerId, long testId, CancellationToken ct)
    {
        var owner = await (from t in db.BookingTests
                           join b in db.Bookings on t.BookingId equals b.Id
                           where t.Id == testId
                           select new { t.BookingId, b.CenterId }).FirstOrDefaultAsync(ct);
        if (owner is null || owner.CenterId != centerId) throw new AppException(404, "Test line not found.");
        var booking = await LockBookingAsync(centerId, owner.BookingId, ct);
        var row = await db.BookingTests.AsTracking().Include(t => t.Test).FirstAsync(t => t.Id == testId, ct);
        return (row, booking);
    }

    private async Task<(BookingPackage Row, Booking Booking)> LockPackageAsync(long centerId, long packageId, CancellationToken ct)
    {
        var owner = await (from p in db.BookingPackages
                           join b in db.Bookings on p.BookingId equals b.Id
                           where p.Id == packageId
                           select new { p.BookingId, b.CenterId }).FirstOrDefaultAsync(ct);
        if (owner is null || owner.CenterId != centerId) throw new AppException(404, "Package line not found.");
        var booking = await LockBookingAsync(centerId, owner.BookingId, ct);
        var row = await db.BookingPackages.AsTracking().FirstAsync(p => p.Id == packageId, ct);
        return (row, booking);
    }

    private async Task<(BookingPayment Row, Booking Booking)> LockPaymentAsync(long centerId, long paymentId, CancellationToken ct)
    {
        var owner = await (from p in db.BookingPayments
                           join b in db.Bookings on p.BookingId equals b.Id
                           where p.Id == paymentId
                           select new { p.BookingId, b.CenterId }).FirstOrDefaultAsync(ct);
        if (owner is null || owner.CenterId != centerId) throw new AppException(404, "Receipt not found.");
        var booking = await LockBookingAsync(centerId, owner.BookingId, ct);
        var row = await db.BookingPayments.AsTracking().FirstAsync(p => p.Id == paymentId, ct);
        return (row, booking);
    }

    /// <summary>Live bill total: every non-deleted test line plus every non-deleted package line.</summary>
    private async Task<decimal> LiveTotalAsync(long bookingId, CancellationToken ct)
    {
        var tests = await db.BookingTests.Where(t => t.BookingId == bookingId && !t.IsDeleted).SumAsync(t => t.Price, ct);
        var packs = await db.BookingPackages.Where(p => p.BookingId == bookingId && !p.IsDeleted).SumAsync(p => p.Price, ct);
        return tests + packs;
    }

    private static void CheckTotalCoversMoney(decimal newTotal, decimal discount, decimal netPaid, string what)
    {
        var bill = newTotal - discount;
        if (bill < 0) throw new AppException(400, "The discount is larger than the new bill. Reduce the discount first.");
        if (netPaid > bill)
            throw new AppException(400, $"Collected ₹{netPaid:0.00} is more than the new bill ₹{bill:0.00}. Refund ₹{netPaid - bill:0.00} first, then delete {what}.");
    }

    public async Task DeleteTestAsync(long centerId, long testId, long userId, string reason, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var (t, b) = await LockTestAsync(centerId, testId, ct);
            if (t.PackageId is not null) throw new AppException(400, "This test belongs to a package. Delete the package instead.");
            if (t.IsDeleted) throw new AppException(400, "This test is already deleted.");

            var (gross, refunded) = await MoneyAsync(b.Id, ct);
            var netPaid = gross - refunded;
            var newTotal = await LiveTotalAsync(b.Id, ct) - t.Price;
            CheckTotalCoversMoney(newTotal, b.Discount, netPaid, "this test");

            t.IsDeleted = true; t.DeletedAt = DateTime.UtcNow; t.DeletedBy = userId; t.DeleteReason = reason.Trim();
            b.Total = newTotal;
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "delete-test", Entity = "booking_test", EntityId = testId.ToString(),
                Detail = $"{t.Test.Name}; price={t.Price}; reason={reason.Trim()}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    public async Task RestoreTestAsync(long centerId, long testId, long userId, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var (t, b) = await LockTestAsync(centerId, testId, ct);
            if (t.PackageId is not null) throw new AppException(400, "This test belongs to a package. Restore the package instead.");
            if (!t.IsDeleted) throw new AppException(400, "This test is not deleted.");

            var newTotal = await LiveTotalAsync(b.Id, ct) + t.Price;
            t.IsDeleted = false; t.DeletedAt = null; t.DeletedBy = null; t.DeleteReason = null;
            b.Total = newTotal;
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "restore-test", Entity = "booking_test", EntityId = testId.ToString(),
                Detail = $"{t.Test.Name}; price={t.Price}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    public async Task DeletePackageAsync(long centerId, long packageId, long userId, string reason, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var (p, b) = await LockPackageAsync(centerId, packageId, ct);
            if (p.IsDeleted) throw new AppException(400, "This package is already deleted.");

            // BookingTest.PackageId is the catalog package id, not the booking_packages row id.
            var components = await db.BookingTests.AsTracking()
                .Where(t => t.BookingId == b.Id && t.PackageId == p.PackageId && !t.IsDeleted).ToListAsync(ct);
            var (gross, refunded) = await MoneyAsync(b.Id, ct);
            var netPaid = gross - refunded;
            var newTotal = await LiveTotalAsync(b.Id, ct) - p.Price - components.Sum(c => c.Price);
            CheckTotalCoversMoney(newTotal, b.Discount, netPaid, "this package");

            var now = DateTime.UtcNow;
            p.IsDeleted = true; p.DeletedAt = now; p.DeletedBy = userId; p.DeleteReason = reason.Trim();
            foreach (var c in components)
            {
                c.IsDeleted = true; c.DeletedAt = now; c.DeletedBy = userId; c.DeleteReason = reason.Trim();
            }
            b.Total = newTotal;
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "delete-package", Entity = "booking_package", EntityId = packageId.ToString(),
                Detail = $"{p.Name}; price={p.Price}; components={components.Count}; reason={reason.Trim()}", CreatedAt = now
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    public async Task RestorePackageAsync(long centerId, long packageId, long userId, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var (p, b) = await LockPackageAsync(centerId, packageId, ct);
            if (!p.IsDeleted) throw new AppException(400, "This package is not deleted.");

            var components = await db.BookingTests.AsTracking()
                .Where(t => t.BookingId == b.Id && t.PackageId == p.PackageId && t.IsDeleted).ToListAsync(ct);
            var newTotal = await LiveTotalAsync(b.Id, ct) + p.Price + components.Sum(c => c.Price);
            p.IsDeleted = false; p.DeletedAt = null; p.DeletedBy = null; p.DeleteReason = null;
            foreach (var c in components)
            {
                c.IsDeleted = false; c.DeletedAt = null; c.DeletedBy = null; c.DeleteReason = null;
            }
            b.Total = newTotal;
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "restore-package", Entity = "booking_package", EntityId = packageId.ToString(),
                Detail = $"{p.Name}; price={p.Price}; components={components.Count}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    public async Task DeletePaymentAsync(long centerId, long paymentId, long userId, string reason, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var (pay, b) = await LockPaymentAsync(centerId, paymentId, ct);
            if (pay.IsDeleted) throw new AppException(400, "This receipt is already deleted.");

            var (gross, refunded) = await MoneyAsync(b.Id, ct);
            var netAfter = pay.Kind == "refund" ? gross - (refunded - pay.Amount) : (gross - pay.Amount) - refunded;
            var balanceAfter = b.Total - b.Discount - netAfter;
            if (netAfter < 0)
                throw new AppException(400, "Deleting this receipt would make the collected money negative. Remove or restore refunds first.");
            if (balanceAfter < 0)
                throw new AppException(400, $"Deleting this receipt would make the bill overpaid by ₹{-balanceAfter:0.00}. Refund the difference first.");

            pay.IsDeleted = true; pay.DeletedAt = DateTime.UtcNow; pay.DeletedBy = userId; pay.DeleteReason = reason.Trim();
            b.Paid = netAfter;
            await db.SaveChangesAsync(ct);
            await AddRevenueAsync(centerId, pay.Kind == "refund" ? pay.Amount : -pay.Amount, ct);
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "delete-receipt", Entity = "booking_payment", EntityId = paymentId.ToString(),
                Detail = $"{pay.ReceiptNo}; kind={pay.Kind}; amount={pay.Amount}; reason={reason.Trim()}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    public async Task RestorePaymentAsync(long centerId, long paymentId, long userId, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var (pay, b) = await LockPaymentAsync(centerId, paymentId, ct);
            if (!pay.IsDeleted) throw new AppException(400, "This receipt is not deleted.");

            var (gross, refunded) = await MoneyAsync(b.Id, ct);
            var netAfter = pay.Kind == "refund" ? gross - (refunded + pay.Amount) : (gross + pay.Amount) - refunded;
            var balanceAfter = b.Total - b.Discount - netAfter;
            if (netAfter < 0)
                throw new AppException(400, "Restoring this refund would make the collected money negative. Collect more money first.");
            if (balanceAfter < 0)
                throw new AppException(400, $"Restoring this receipt would make the bill overpaid by ₹{-balanceAfter:0.00}. Refund the difference first.");

            pay.IsDeleted = false; pay.DeletedAt = null; pay.DeletedBy = null; pay.DeleteReason = null;
            b.Paid = netAfter;
            await db.SaveChangesAsync(ct);
            await AddRevenueAsync(centerId, pay.Kind == "refund" ? -pay.Amount : pay.Amount, ct);
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "restore-receipt", Entity = "booking_payment", EntityId = paymentId.ToString(),
                Detail = $"{pay.ReceiptNo}; kind={pay.Kind}; amount={pay.Amount}", CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    /// <summary>Restoring a visit only clears its flags; its tests/packages/receipts stay exactly as they are.</summary>
    public async Task RestoreBookingAsync(long centerId, long bookingId, long userId, CancellationToken ct)
    {
        await InTransactionAsync(async () =>
        {
            var rows = await db.Database.SqlQuery<long>(
                $"SELECT id AS Value FROM bookings WHERE id = {bookingId} AND center_id = {centerId} FOR UPDATE").ToListAsync(ct);
            if (rows.Count == 0) throw new AppException(404, "Booking not found.");
            var b = await db.Bookings.AsTracking().FirstAsync(x => x.Id == bookingId, ct);
            if (!b.IsDeleted) throw new AppException(400, "This visit is not deleted.");

            b.IsDeleted = false; b.DeletedAt = null; b.DeletedBy = null; b.DeleteReason = null;
            db.AuditLog.Add(new AuditLog
            {
                UserId = userId, Action = "restore-booking", Entity = "booking", EntityId = bookingId.ToString(),
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return true;
        }, ct);
    }

    /// <summary>Delete Log: deleted bookings, test lines, packages and receipts in one newest-first list.</summary>
    public async Task<PagedResult<DeletedRowVm>> GetDeleteLogAsync(long centerId, DeleteLogQuery q, CancellationToken ct)
    {
        var size = Math.Clamp(q.Size, 1, 100);
        var offset = Math.Max(0, q.Offset);

        var bookings = db.Bookings.Where(b => b.CenterId == centerId && b.IsDeleted)
            .Select(b => new DelRow
            {
                Kind = "Booking", EntityId = b.Id, BookingId = b.Id, LabNo = b.LabNo, BillNo = b.BillNo,
                PatientName = ((b.Patient.Title ?? "") + " " + b.Patient.FirstName + " " + (b.Patient.LastName ?? "")).Trim(),
                Title = "Visit deleted", Detail = "Booking", Amount = b.Total,
                DeletedAt = b.DeletedAt ?? b.BookedAt, DeletedById = b.DeletedBy, Reason = b.DeleteReason ?? ""
            });

        var tests = (from t in db.BookingTests
                     join b in db.Bookings on t.BookingId equals b.Id
                     join ts in db.Tests on t.TestId equals ts.Id
                     where t.IsDeleted && t.PackageId == null && b.CenterId == centerId
                     select new DelRow
                     {
                         Kind = "Test", EntityId = t.Id, BookingId = b.Id, LabNo = b.LabNo, BillNo = b.BillNo,
                         PatientName = ((b.Patient.Title ?? "") + " " + b.Patient.FirstName + " " + (b.Patient.LastName ?? "")).Trim(),
                         Title = ts.Name, Detail = "Investigation", Amount = t.Price,
                         DeletedAt = t.DeletedAt ?? t.BookedAt, DeletedById = t.DeletedBy, Reason = t.DeleteReason ?? ""
                     });

        var packages = (from p in db.BookingPackages
                        join b in db.Bookings on p.BookingId equals b.Id
                        where p.IsDeleted && b.CenterId == centerId
                        select new DelRow
                        {
                            Kind = "Package", EntityId = p.Id, BookingId = b.Id, LabNo = b.LabNo, BillNo = b.BillNo,
                            PatientName = ((b.Patient.Title ?? "") + " " + b.Patient.FirstName + " " + (b.Patient.LastName ?? "")).Trim(),
                            Title = p.Name, Detail = "Package", Amount = p.Price,
                            DeletedAt = p.DeletedAt ?? b.BookedAt, DeletedById = p.DeletedBy, Reason = p.DeleteReason ?? ""
                        });

        var receipts = (from p in db.BookingPayments
                        join b in db.Bookings on p.BookingId equals b.Id
                        where p.IsDeleted && b.CenterId == centerId
                        select new DelRow
                        {
                            Kind = "Receipt", EntityId = p.Id, BookingId = b.Id, LabNo = b.LabNo, BillNo = b.BillNo,
                            PatientName = ((b.Patient.Title ?? "") + " " + b.Patient.FirstName + " " + (b.Patient.LastName ?? "")).Trim(),
                            Title = p.ReceiptNo ?? "Receipt", Detail = p.Kind == "refund" ? "Refund" : "Payment", Amount = p.Amount,
                            DeletedAt = p.DeletedAt ?? p.PaidAt, DeletedById = p.DeletedBy, Reason = p.DeleteReason ?? ""
                        });

        IQueryable<DelRow> all = bookings.Concat(tests).Concat(packages).Concat(receipts);
        var type = string.IsNullOrWhiteSpace(q.Type) || q.Type.Equals("all", StringComparison.OrdinalIgnoreCase) ? null : q.Type.Trim();
        if (type is not null)
        {
            if (type.Equals("Test", StringComparison.OrdinalIgnoreCase)) all = tests;
            else if (type.Equals("Package", StringComparison.OrdinalIgnoreCase)) all = packages;
            else if (type.Equals("Receipt", StringComparison.OrdinalIgnoreCase)) all = receipts;
            else if (type.Equals("Booking", StringComparison.OrdinalIgnoreCase)) all = bookings;
        }

        // Delete-log days are IST days too; deleted_at is stored UTC.
        if (q.From is DateTime from) { var start = IndianTime.ToUtc(from.Date); all = all.Where(x => x.DeletedAt >= start); }
        if (q.To is DateTime to) { var end = IndianTime.ToUtc(to.Date.AddDays(1)); all = all.Where(x => x.DeletedAt < end); }
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var like = $"%{q.Q.Trim()}%";
            long? lab = long.TryParse(q.Q.Trim(), out var n) ? n : null;
            all = all.Where(x => EF.Functions.Like(x.PatientName, like) || EF.Functions.Like(x.BillNo, like)
                || EF.Functions.Like(x.Title, like) || EF.Functions.Like(x.Reason, like)
                || (lab != null && x.LabNo == lab));
        }

        var rows = await all.OrderByDescending(x => x.DeletedAt).ThenByDescending(x => x.EntityId)
            .Skip(offset).Take(size + 1).ToListAsync(ct);

        var userIds = rows.Where(r => r.DeletedById is not null).Select(r => r.DeletedById!.Value).Distinct().ToList();
        var names = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        var items = rows.Take(size).Select(r => new DeletedRowVm(r.Kind, r.EntityId, r.BookingId, r.LabNo, r.BillNo,
            r.PatientName, r.Title, r.Detail, r.Amount, r.DeletedAt,
            r.DeletedById is long id && names.TryGetValue(id, out var name) ? name : "—", r.Reason)).ToList();
        return new PagedResult<DeletedRowVm>(items, rows.Count > size);
    }

    /// <summary>Flat projection used by the Delete Log union (four tables into one shape).</summary>
    private sealed class DelRow
    {
        public string Kind { get; set; } = "";
        public long EntityId { get; set; }
        public long BookingId { get; set; }
        public long LabNo { get; set; }
        public string BillNo { get; set; } = "";
        public string PatientName { get; set; } = "";
        public string Title { get; set; } = "";
        public string Detail { get; set; } = "";
        public decimal? Amount { get; set; }
        public DateTime DeletedAt { get; set; }
        public long? DeletedById { get; set; }
        public string Reason { get; set; } = "";
    }

    /// <summary>Edits the shared patient record (all visits show the new details).</summary>
    public async Task UpdatePatientAsync(long centerId, long patientId, long userId, PatientEditForm f, CancellationToken ct)
    {
        var visible = await db.Bookings.AnyAsync(b => b.PatientId == patientId && b.CenterId == centerId, ct);
        if (!visible) throw new AppException(404, "Patient not found.");

        var p = await db.Patients.AsTracking().FirstOrDefaultAsync(x => x.Id == patientId, ct)
                ?? throw new AppException(404, "Patient not found.");
        p.Title = NullIfEmpty(f.Title); p.FirstName = f.FirstName.Trim(); p.LastName = NullIfEmpty(f.LastName);
        p.Gender = f.Gender; p.AgeYears = f.AgeYears; p.AgeMonths = f.AgeMonths; p.AgeDays = f.AgeDays;
        p.Mobile = NullIfEmpty(f.Mobile); p.Email = NullIfEmpty(f.Email); p.Address = NullIfEmpty(f.Address);

        db.AuditLog.Add(new AuditLog { UserId = userId, Action = "edit-patient", Entity = "patient", EntityId = patientId.ToString(), CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Edits the name snapshots and notes on this bill only.</summary>
    public async Task UpdateMetaAsync(long centerId, long bookingId, long userId, BookingMetaForm f, CancellationToken ct)
    {
        var b = await db.Bookings.AsTracking()
            .FirstOrDefaultAsync(x => x.Id == bookingId && x.CenterId == centerId && !x.IsDeleted, ct)
            ?? throw new AppException(404, "Booking not found.");

        b.ReferralDoctor = NullIfEmpty(f.ReferralDoctor);
        b.Corporate = NullIfEmpty(f.Corporate);
        b.Remark = NullIfEmpty(f.Remark);
        if (!string.IsNullOrWhiteSpace(f.PatientType)) b.PatientType = f.PatientType.Trim();
        if (!string.IsNullOrWhiteSpace(f.DeliveryMode)) b.DeliveryMode = f.DeliveryMode.Trim();

        db.AuditLog.Add(new AuditLog { UserId = userId, Action = "edit-booking", Entity = "booking", EntityId = bookingId.ToString(), CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>One receipt document for one payment/refund row.</summary>
    public async Task<PaymentReceiptVm?> GetPaymentReceiptAsync(long centerId, long paymentId, string companyName, CancellationToken ct)
    {
                var row = await (from p in db.BookingPayments
                         join b in db.Bookings on p.BookingId equals b.Id
                         where p.Id == paymentId && !p.IsDeleted && b.CenterId == centerId && !b.IsDeleted
                         select new { Pay = p, Booking = b }).FirstOrDefaultAsync(ct);
        if (row is null) return null;

        var patient = await db.Patients.Where(x => x.Id == row.Booking.PatientId)
            .Select(x => new { x.Uid, x.Title, x.FirstName, x.LastName }).FirstOrDefaultAsync(ct);
        if (patient is null) return null;

        var rows = await db.BookingPayments.Where(p => p.BookingId == row.Booking.Id && !p.IsDeleted)
            .Select(p => new { p.Kind, p.Amount }).ToListAsync(ct);
        var paid = rows.Where(p => p.Kind != "refund").Sum(p => p.Amount);
        var refunded = rows.Where(p => p.Kind == "refund").Sum(p => p.Amount);
        var name = ((patient.Title ?? "") + " " + patient.FirstName + " " + (patient.LastName ?? "")).Trim();

        return new PaymentReceiptVm(companyName, row.Booking.BillNo, row.Booking.LabNo, name, patient.Uid,
            row.Pay.ReceiptNo ?? $"R{row.Pay.Id:D6}", row.Pay.Kind, row.Pay.Amount, row.Pay.Mode, row.Pay.PaidAt,
            row.Pay.Reason, row.Pay.Remark, row.Booking.Total, row.Booking.Discount, paid, refunded,
            row.Booking.Total - row.Booking.Discount - (paid - refunded));
    }

}