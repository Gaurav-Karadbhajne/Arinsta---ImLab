namespace ImLab.Models.Entities.Master;

public class Tenant
{
    public long Id { get; set; }
    public string CompanyId { get; set; } = "";
    public string CompanyName { get; set; } = "";
    public int DbServerId { get; set; }
    public string DbName { get; set; } = "";
    public string DbUser { get; set; } = "";
    public string DbPasswordEnc { get; set; } = "";
    public string Status { get; set; } = "active";
    public int? PlanId { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class DbServer
{
    public int Id { get; set; }
    public string Host { get; set; } = "";
    public int MaxTenants { get; set; }
    public int TenantCount { get; set; }
    public bool IsOpen { get; set; }
}
