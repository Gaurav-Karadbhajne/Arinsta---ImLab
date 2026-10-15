using System.Security.Cryptography;
using System.Text;
using ImLab.Models.Data;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;
using Microsoft.Extensions.Caching.Memory;

namespace ImLab.Models.Services;

/// <summary>Reads the single config table: platform defaults overridden by this lab's own rows. Cached per lab with a version for ETag.</summary>
public sealed class ConfigService(ConfigRepository repo, ITenantContext tenant, IMemoryCache cache)
{
    public Task<ConfigVm> GetAsync(CancellationToken ct) =>
        cache.GetOrCreateAsync($"cfg:{tenant.Id}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            var platform = await repo.PlatformAsync(ct);
            var own = await repo.TenantAsync(ct);
            var values = platform.ToDictionary(p => $"{p.GroupCode}.{p.ConfigKey}", p => p.ConfigValue ?? p.DefaultValue ?? "");
            var locked = platform.Where(p => !p.IsTenantEditable).Select(p => $"{p.GroupCode}.{p.ConfigKey}").ToHashSet();
            foreach (var c in own) { var k = $"{c.GroupCode}.{c.ConfigKey}"; if (!locked.Contains(k)) values[k] = c.ConfigValue ?? ""; }
            var raw = string.Join('|', values.OrderBy(v => v.Key).Select(v => v.Key + "=" + v.Value));
            var version = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)))[..16];
            return new ConfigVm(version, values);
        })!;

    public async Task UpdateAsync(ConfigUpdate u, CancellationToken ct)
    {
        if (!await repo.UpsertAsync(u.Group, u.Key, u.Value, ct)) throw new AppException(403, "This setting is locked by the platform.");
        cache.Remove($"cfg:{tenant.Id}");
    }
}
