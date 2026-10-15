using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Repositories;

public sealed class ConfigRepository(MasterDbContext master, TenantDbContext tenantDb)
{
    public Task<List<ConfigItem>> PlatformAsync(CancellationToken ct) => master.Config.Where(c => c.Scope == "platform" && c.IsActive).ToListAsync(ct);
    public Task<List<ConfigItem>> TenantAsync(CancellationToken ct) => tenantDb.Config.Where(c => c.IsActive).ToListAsync(ct);

    public async Task<bool> UpsertAsync(string group, string key, string value, CancellationToken ct)
    {
        var platform = await master.Config.FirstOrDefaultAsync(c => c.Scope == "platform" && c.GroupCode == group && c.ConfigKey == key, ct);
        if (platform is not null && !platform.IsTenantEditable) return false;
        var now = DateTime.UtcNow;
        var updated = await tenantDb.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE config SET config_value = {value}, version = version + 1, updated_at = {now} WHERE scope = 'tenant' AND scope_ref = '' AND group_code = {group} AND config_key = {key}", ct);
        if (updated == 0)
        {
            tenantDb.Config.Add(new ConfigItem
            {
                Scope = "tenant", ScopeRef = "", GroupCode = group, ConfigKey = key, ConfigValue = value, DefaultValue = platform?.DefaultValue,
                DataType = platform?.DataType ?? "string", UiControl = platform?.UiControl ?? "text", Label = platform?.Label ?? key, UpdatedAt = now
            });
            await tenantDb.SaveChangesAsync(ct);
        }
        return true;
    }
}
