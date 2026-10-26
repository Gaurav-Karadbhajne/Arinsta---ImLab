using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using ImLab.Models.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Repositories;

/// <summary>
/// Masters data access. Mirrors BookingRepository: inject TenantDbContext, return ViewModels,
/// one small method per query. No business rules here — those live in MasterService.
/// </summary>
public sealed class MasterRepository(TenantDbContext db)
{
    /// <summary>Tests grid: optional name/short-name search + department filter, in display order.</summary>
    public Task<List<TestRowVm>> GetTestsAsync(TestQuery q, CancellationToken ct)
    {
        var query = db.Tests.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(t => t.Name.Contains(s) || t.ShortName.Contains(s));
        }
        if (q.DepartmentId is long dept) query = query.Where(t => t.DepartmentId == dept);
        return query.OrderBy(t => t.SortOrder).ThenBy(t => t.Id)
            .Join(db.Departments, t => t.DepartmentId, d => d.Id,           // join so the grid shows "Haematology", not an id
                (t, d) => new TestRowVm(t.Id, t.Name, t.ShortName, d.Name, t.Price, t.SortOrder, t.IsActive))
            .ToListAsync(ct);
    }

    /// <summary>Active+inactive departments for the tests screen dropdown/filter.</summary>
    public Task<List<DepartmentVm>> GetDepartmentsAsync(CancellationToken ct) =>
        db.Departments.OrderBy(d => d.SortOrder).ThenBy(d => d.Id)
          .Select(d => new DepartmentVm(d.Id, d.Name, d.Code, d.IsActive))
          .ToListAsync(ct);

    public async Task<Test> AddTestAsync(TestForm f, CancellationToken ct)
    {
        var t = new Test
        {
            Name = f.Name.Trim(), ShortName = f.ShortName.Trim(), DepartmentId = f.DepartmentId,
            Price = f.Price, SortOrder = f.SortOrder, IsActive = true
        };
        db.Tests.Add(t);
        await db.SaveChangesAsync(ct);
        return t;
    }

    /// <summary>ExecuteUpdate because the whole context is NoTracking: returns rows affected (0 = test id didn't exist).</summary>
    public Task<int> UpdateTestAsync(long id, TestForm f, CancellationToken ct) =>
        db.Tests.Where(x => x.Id == id).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.Name, f.Name.Trim())
            .SetProperty(x => x.ShortName, f.ShortName.Trim())
            .SetProperty(x => x.DepartmentId, f.DepartmentId)
            .SetProperty(x => x.Price, f.Price)
            .SetProperty(x => x.SortOrder, f.SortOrder), ct);

    /// <summary>Soft on/off: inactive tests vanish from the booking catalog; old bills keep their rows.</summary>
    public async Task<bool> ToggleTestActiveAsync(long id, CancellationToken ct) =>
        (await db.Tests.Where(x => x.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, x => !x.IsActive), ct)) > 0;
}