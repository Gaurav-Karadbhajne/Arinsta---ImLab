using ImLab.Models.Data;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;
using Microsoft.Extensions.Caching.Memory;

namespace ImLab.Models.Services;

/// <summary>
/// Masters business rules. Sits between MasterController and MasterRepository.
/// The booking catalog is cached for 10 minutes (see BookingService.CatalogAsync),
/// so every test change MUST clear it or the booking screen shows stale tests/prices.
/// </summary>
public sealed class MasterService(MasterRepository repo, IMemoryCache cache, ITenantContext tenant)
{
    private void BustCatalogCache() => cache.Remove($"catalog:{tenant.Id}");

    public Task<List<TestRowVm>> ListTestsAsync(TestQuery q, CancellationToken ct) => repo.GetTestsAsync(q, ct);
    public Task<List<DepartmentVm>> ListDepartmentsAsync(CancellationToken ct) => repo.GetDepartmentsAsync(ct);

    public async Task CreateTestAsync(TestForm f, CancellationToken ct)
    {
        await repo.AddTestAsync(f, ct);
        BustCatalogCache();
    }

    public async Task UpdateTestAsync(long id, TestForm f, CancellationToken ct)
    {
        if (await repo.UpdateTestAsync(id, f, ct) == 0) throw new AppException(404, "Test not found.");
        BustCatalogCache();
    }

    public async Task ToggleTestActiveAsync(long id, CancellationToken ct)
    {
        if (!await repo.ToggleTestActiveAsync(id, ct)) throw new AppException(404, "Test not found.");
        BustCatalogCache();
    }
}