namespace ImLab.Models.ViewModels;

public record LoginRequest(string CompanyId, string Username, string Password);
public record LoginResult(string Token, DateTime ExpiresAt, string FullName, string Role, string CompanyName, string Landing);

public record TestPickerItem(long Id, string Name, string ShortName, decimal Price, string Department);
public record BookingTestInput(long TestId, bool IsOutsource = false, long? OutsourceLabId = null);
public record BookingForm(
    long? PatientId, string? Title, string FirstName, string? LastName, string Gender, int AgeYears, string? Mobile, string? Email,
    string? ReferralDoctor, string? Corporate, decimal DiscountPercent, decimal PaidAmount, string PaymentMode,
    List<BookingTestInput> Tests);
public record BookingCreatedVm(long BookingId, long LabNo, string BillNo, string PatientUid, decimal Total, decimal Discount, decimal Paid, decimal Balance);

public record BookingQuery(string? Search, string? Mobile, long? AfterId, int PageSize = 25);
public record BookingRowVm(long Id, long LabNo, string PatientName, string Uid, int AgeYears, string Gender, string? Referral, decimal Total, decimal Balance, DateTime BookedAt);
public record PagedResult<T>(List<T> Items, bool HasMore);

public record OutsourceQuery(string? Status, long? AfterId, int PageSize = 25);
public record OutsourceRowVm(long Id, long LabNo, string PatientName, string TestName, string LabName, string Status, DateTime BookedAt);

public record ChartPoint(string Label, decimal Value);
public record DashboardVm(
    int TodayBookings, int TodayDelivered, int Pending, decimal RevenueToday, decimal OutstandingToday, int Outsourced,
    int YesterdayBookings, List<ChartPoint> Revenue7Days, List<ChartPoint> Departments, List<ChartPoint> StatusSplit);

public record ConfigVm(string Version, Dictionary<string, string> Values);
public record ConfigUpdate(string Group, string Key, string Value);

public record ReceiptVm(string CompanyName, string BillNo, long LabNo, string PatientName, string Uid, DateTime BookedAt,
    List<(string Test, decimal Price)> Lines, decimal Total, decimal Discount, decimal Paid, string PaymentMode)
{ public decimal Balance => Total - Discount - Paid; }
