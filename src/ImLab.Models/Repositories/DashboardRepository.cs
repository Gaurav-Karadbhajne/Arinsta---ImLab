using ImLab.Models.Data;
using ImLab.Models.Enums;
using ImLab.Models.Services;
using ImLab.Models.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Repositories;

public sealed class DashboardRepository(TenantDbContext db)
{
    public async Task<DashboardVm> GetAsync(long centerId, CancellationToken ct)
    {
        // Dashboard days are the lab's IST days; bookings are stored as UTC instants.
        var summaryToday = IndianTime.Today;
        var today = IndianTime.ToUtc(summaryToday.ToDateTime(TimeOnly.MinValue));
        var from = summaryToday.AddDays(-6);
        var sums = await db.DailySummary.Where(s => s.CenterId == centerId && s.SummaryDate >= from).OrderBy(s => s.SummaryDate).ToListAsync(ct);
        var t = sums.FirstOrDefault(s => s.SummaryDate == summaryToday);
        var y = sums.FirstOrDefault(s => s.SummaryDate == summaryToday.AddDays(-1));

        var since = today.AddDays(-30);
                var pending = await db.BookingTests.CountAsync(x => !x.IsDeleted && x.Status <= BookingStatus.PreAuth && x.BookedAt >= since && x.Booking.CenterId == centerId, ct);
        var outsourced = await db.BookingTests.CountAsync(x => !x.IsDeleted && x.IsOutsource && x.OutsourceStatus != OutsourceStatus.Received && x.Booking.CenterId == centerId, ct);

        var byDept = await db.BookingTests.Where(x => !x.IsDeleted && x.Status <= BookingStatus.PreAuth && x.BookedAt >= since && x.Booking.CenterId == centerId)
            .GroupBy(x => x.DepartmentId).Select(g => new { g.Key, N = g.Count() }).ToListAsync(ct);
        var deptNames = await db.Departments.ToDictionaryAsync(d => d.Id, d => d.Name, ct);
        var bySt = await db.BookingTests.Where(x => !x.IsDeleted && x.BookedAt >= today && x.Booking.CenterId == centerId)
            .GroupBy(x => x.Status).Select(g => new { g.Key, N = g.Count() }).ToListAsync(ct);

        var revenue = Enumerable.Range(0, 7).Select(i => summaryToday.AddDays(i - 6))
            .Select(d => new ChartPoint(d.ToString("ddd"), sums.FirstOrDefault(s => s.SummaryDate == d)?.Revenue ?? 0)).ToList();

        return new DashboardVm(t?.Bookings ?? 0, t?.Delivered ?? 0, pending, t?.Revenue ?? 0, t?.Outstanding ?? 0, outsourced, y?.Bookings ?? 0, revenue,
            byDept.Select(d => new ChartPoint(deptNames.GetValueOrDefault(d.Key, "Other"), d.N)).ToList(),
            bySt.Select(s => new ChartPoint(s.Key.ToString(), s.N)).ToList());
    }
}
