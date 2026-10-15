using ImLab.Models.Data;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;
using Microsoft.Extensions.Caching.Memory;

namespace ImLab.Models.Services;

public sealed class DashboardService(DashboardRepository repo, ConfigService config, ICurrentUser user, ITenantContext tenant, IMemoryCache cache)
{
    public async Task<DashboardVm> GetAsync(CancellationToken ct)
    {
        var key = $"dash:{tenant.Id}:{user.CenterId}";
        if (cache.TryGetValue(key, out DashboardVm? hit) && hit is not null) return hit;
        var vm = await repo.GetAsync(user.CenterId, ct);
        var seconds = int.TryParse((await config.GetAsync(ct)).Values.GetValueOrDefault("dashboard.cache_seconds"), out var s) ? s : 45;
        cache.Set(key, vm, TimeSpan.FromSeconds(Math.Clamp(seconds, 5, 300)));
        return vm;
    }
}
