using System.Text.Json;
using ImLab.Models.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;

namespace ImLab.Models.Repositories;

public interface ITenantStore { Task<TenantInfo?> GetAsync(string companyId, CancellationToken ct); }

/// <summary>Resolves a Company ID to its database. Memory cache first, Redis second, master database last.</summary>
public sealed class TenantStore(IMemoryCache memory, IDistributedCache distributed, MasterDbContext master) : ITenantStore
{
    public async Task<TenantInfo?> GetAsync(string companyId, CancellationToken ct)
    {
        var id = companyId.Trim().ToUpperInvariant();
        var key = $"tenant:{id}";
        if (memory.TryGetValue(key, out TenantInfo? hit)) return hit;

        TenantInfo? t = null;
        var json = await distributed.GetStringAsync(key, ct);
        if (json is not null) t = JsonSerializer.Deserialize<TenantInfo>(json);

        if (t is null)
        {
            t = await (from x in master.Tenants.AsNoTracking()
                       join s in master.DbServers.AsNoTracking() on x.DbServerId equals s.Id
                       where x.CompanyId == id && x.Status == "active"
                       select new TenantInfo(x.Id, x.CompanyId, x.CompanyName, s.Host, x.DbName, x.DbUser, x.DbPasswordEnc))
                      .FirstOrDefaultAsync(ct);
            if (t is not null)
                await distributed.SetStringAsync(key, JsonSerializer.Serialize(t),
                    new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) }, ct);
        }
        if (t is not null) memory.Set(key, t, TimeSpan.FromMinutes(5));
        return t;
    }
}
