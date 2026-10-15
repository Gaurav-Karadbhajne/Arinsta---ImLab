namespace ImLab.Models.Entities.Tenant;

/// <summary>One row of the single config table (used in the master and in every tenant database).</summary>
public class ConfigItem
{
    public long Id { get; set; }
    public string Scope { get; set; } = "platform";
    public string ScopeRef { get; set; } = "";
    public string GroupCode { get; set; } = "";
    public string ConfigKey { get; set; } = "";
    public string? ConfigValue { get; set; }
    public string? DefaultValue { get; set; }
    public string DataType { get; set; } = "string";
    public string UiControl { get; set; } = "text";
    public string Label { get; set; } = "";
    public string? Description { get; set; }
    public bool IsTenantEditable { get; set; } = true;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTime UpdatedAt { get; set; }
}
