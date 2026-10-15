namespace ImLab.Models.Data;

public sealed record TenantInfo(long Id, string CompanyId, string CompanyName, string Host, string Database, string User, string PasswordEnc);

/// <summary>Per-request holder of the resolved lab. Set once by the tenant middleware (or the login service).</summary>
public interface ITenantContext
{
    bool IsResolved { get; }
    long Id { get; }
    string CompanyId { get; }
    string CompanyName { get; }
    string Host { get; }
    string Database { get; }
    string User { get; }
    string Password { get; }
    void Set(TenantInfo info);
}

public sealed class TenantContext(Services.SecretProtector protector) : ITenantContext
{
    private TenantInfo? _info; private string _password = "";
    public bool IsResolved => _info is not null;
    public long Id => _info!.Id;
    public string CompanyId => _info!.CompanyId;
    public string CompanyName => _info!.CompanyName;
    public string Host => _info!.Host;
    public string Database => _info!.Database;
    public string User => _info!.User;
    public string Password => _password;
    public void Set(TenantInfo info) { _info = info; _password = protector.Unprotect(info.PasswordEnc); }
}
