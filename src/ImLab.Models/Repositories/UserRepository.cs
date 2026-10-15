using ImLab.Models.Data;
using ImLab.Models.Entities.Tenant;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Repositories;

public sealed class UserRepository(TenantDbContext db)
{
    public Task<User?> FindActiveAsync(string username, CancellationToken ct) =>
        db.Users.FirstOrDefaultAsync(u => u.Username == username && u.IsActive && !u.IsDeleted, ct);

    public Task<Role?> GetRoleAsync(long roleId, CancellationToken ct) => db.Roles.FirstOrDefaultAsync(r => r.Id == roleId, ct);

    public Task<List<string>> GetPermissionsAsync(long roleId, CancellationToken ct) =>
        db.RolePermissions.Where(p => p.RoleId == roleId).Select(p => p.PermKey).ToListAsync(ct);

    // MySQL evaluates SET assignments left to right, so failed_attempts is already incremented in the IF.
    public Task RegisterFailureAsync(long userId, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"UPDATE users SET failed_attempts = failed_attempts + 1, locked_until = IF(failed_attempts >= 5, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), locked_until) WHERE id = {userId}", ct);

    public Task ResetFailuresAsync(long userId, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = {userId}", ct);
}
