namespace ImLab.Models.Services;

public class AppException(int status, string message) : Exception(message) { public int Status { get; } = status; }

/// <summary>The signed-in user, read from the validated token. Implemented in the web project.</summary>
public interface ICurrentUser
{
    long UserId { get; }
    long CenterId { get; }
    long TenantId { get; }
    decimal MaxDiscountPercent { get; }
}

public static class Perm
{
    public const string DashboardView = "dashboard.view";
    public const string BookingView = "booking.view";
    public const string BookingCreate = "booking.create";
    public const string OutsourceView = "outsource.view";
    public const string ConfigView = "config.view";
    public const string ConfigEdit = "config.edit";
}
