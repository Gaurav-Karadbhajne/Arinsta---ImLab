using ImLab.Models.Data;
using ImLab.Models.Repositories;
using ImLab.Models.ViewModels;

namespace ImLab.Models.Services;

// Login flow: find tenant -> find user -> if 3+ failed attempts, require a correct captcha -> verify password.
// We deliberately do NOT lock accounts: a wrong-password lockout at a busy lab front desk is self-inflicted damage.
public sealed class AuthService(ITenantStore store, ITenantContext tenant, UserRepository users, JwtTokenService jwt, CaptchaService captcha)
{
    private const string Generic = "Invalid company ID, username or password.";

    public async Task<LoginResult> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var info = await store.GetAsync(req.CompanyId, ct) ?? throw new AppException(401, Generic);
        tenant.Set(info);                                     // from here the tenant database is available to this request

        var user = await users.FindActiveAsync(req.Username.Trim(), ct) ?? throw new AppException(401, Generic);

        // After 3 failures the password alone is not enough anymore — the client must solve a captcha.
        // 428 Precondition Required tells the client "show the captcha field and retry".
        if (user.FailedAttempts >= 3)
        {
            if (string.IsNullOrEmpty(req.CaptchaId))
                throw new AppException(428, "Please solve the captcha and try again.");
            if (!captcha.Verify(req.CaptchaId, req.CaptchaAnswer))
            {
                await users.RegisterFailureAsync(user.Id, ct);
                throw new AppException(401, "Wrong captcha answer. Try a new one.");
            }
        }

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