using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using ImLab.Models.Enums;
using ImLab.Models.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Repositories;

public sealed class BookingRepository(TenantDbContext db)
{
    public Task<List<TestPickerItem>> GetCatalogAsync(CancellationToken ct) =>
        db.Tests.Where(t => t.IsActive).OrderBy(t => t.SortOrder)
          .Join(db.Departments, t => t.DepartmentId, d => d.Id, (t, d) => new TestPickerItem(t.Id, t.Name, t.ShortName, t.Price, d.Name))
          .ToListAsync(ct);

    public Task<List<Test>> GetTestsAsync(IEnumerable<long> ids, CancellationToken ct) =>
        db.Tests.Where(t => ids.Contains(t.Id) && t.IsActive).ToListAsync(ct);

    public Task<Patient?> GetPatientAsync(long id, CancellationToken ct) => db.Patients.FirstOrDefaultAsync(p => p.Id == id, ct);

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

    public async Task AddAsync(Patient? newPatient, Booking booking, BookingPayment? payment, CancellationToken ct)
    {
        if (newPatient is not null) { db.Patients.Add(newPatient); await db.SaveChangesAsync(ct); booking.PatientId = newPatient.Id; }
        booking.Patient = null!;
        db.Bookings.Add(booking);
        await db.SaveChangesAsync(ct);
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

    /// <summary>Keyset paging: newest first, cheap at any depth.</summary>
    public async Task<PagedResult<BookingRowVm>> SearchAsync(long centerId, BookingQuery q, CancellationToken ct)
    {
        var size = Math.Clamp(q.PageSize, 1, 200);
        var query = db.Bookings.Where(b => b.CenterId == centerId && !b.IsDeleted);
        if (!string.IsNullOrWhiteSpace(q.Mobile)) query = query.Where(b => b.Patient.Mobile == q.Mobile);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = long.TryParse(s, out var labNo)
                ? query.Where(b => b.LabNo == labNo || b.Patient.Mobile == s)
                : query.Where(b => b.Patient.FirstName.StartsWith(s) || b.Patient.Uid == s);
        }
        if (q.AfterId is long after) query = query.Where(b => b.Id < after);
        var rows = await query.OrderByDescending(b => b.Id).Take(size + 1)
            .Select(b => new BookingRowVm(b.Id, b.LabNo, (b.Patient.Title + " " + b.Patient.FirstName + " " + b.Patient.LastName).Trim(), b.Patient.Uid,
                b.Patient.AgeYears, b.Patient.Gender, b.ReferralDoctor, b.Total - b.Discount, b.Total - b.Discount - b.Paid, b.BookedAt))
            .ToListAsync(ct);
        return new PagedResult<BookingRowVm>(rows.Take(size).ToList(), rows.Count > size);
    }

    public async Task<PagedResult<OutsourceRowVm>> OutsourceAsync(long centerId, OutsourceQuery q, CancellationToken ct)
    {
        var size = Math.Clamp(q.PageSize, 1, 200);
        var query = db.BookingTests.Where(t => t.IsOutsource && t.Booking.CenterId == centerId);
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

    public async Task<ReceiptVm?> GetReceiptAsync(long centerId, long bookingId, string companyName, CancellationToken ct)
    {
        var b = await db.Bookings.Where(x => x.Id == bookingId && x.CenterId == centerId)
            .Select(x => new { x.Id, x.BillNo, x.LabNo, x.BookedAt, x.Total, x.Discount, x.Paid, x.PaymentMode, x.Patient }).FirstOrDefaultAsync(ct);
        if (b is null) return null;
        var lines = await db.BookingTests.Where(t => t.BookingId == bookingId).Select(t => new { t.Test.Name, t.Price }).ToListAsync(ct);
        return new ReceiptVm(companyName, b.BillNo, b.LabNo, b.Patient.FullName.Length > 0 ? b.Patient.FullName : b.Patient.FirstName, b.Patient.Uid, b.BookedAt,
            lines.Select(l => (l.Name, l.Price)).ToList(), b.Total, b.Discount, b.Paid, b.PaymentMode);
    }
}
