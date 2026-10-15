using ImLab.Models.Data;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;

namespace ImLab.Models.Services;

public sealed class AuthService(ITenantStore store, ITenantContext tenant, UserRepository users, JwtTokenService jwt)
{
    private const string Generic = "Invalid company ID, username or password.";

    public async Task<LoginResult> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var info = await store.GetAsync(req.CompanyId, ct) ?? throw new AppException(401, Generic);
        tenant.Set(info);                                     // from here the tenant database is available to this request

        var user = await users.FindActiveAsync(req.Username.Trim(), ct) ?? throw new AppException(401, Generic);
        if (user.LockedUntil is DateTime until && until > DateTime.UtcNow) throw new AppException(423, "Account is locked. Try again later.");
        if (!PasswordHasher.Verify(req.Password, user.PasswordHash))
        {
            await users.RegisterFailureAsync(user.Id, ct);
            throw new AppException(401, Generic);
        }
        await users.ResetFailuresAsync(user.Id, ct);

        var role = await users.GetRoleAsync(user.RoleId, ct) ?? throw new AppException(403, "Role not found.");
        var perms = await users.GetPermissionsAsync(user.RoleId, ct);
        var (token, expires) = jwt.Create(user.Id, user.FullName, role.Name, user.CenterId, info.Id, info.CompanyId, perms, role.MaxDiscountPercent);
        return new LoginResult(token, expires, user.FullName, role.Name, info.CompanyName, role.Landing);
    }
}
