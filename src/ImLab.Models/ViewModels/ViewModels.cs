namespace ImLab.Models.ViewModels;

// CaptchaId/CaptchaAnswer are only required after 3 failed attempts — server asks via 428, client then fills them.
public record LoginRequest(string CompanyId, string Username, string Password, string? CaptchaId = null, string? CaptchaAnswer = null);
// A tiny math challenge: Question is shown to the user, CaptchaId is sent back with the answer.
public record CaptchaVm(string CaptchaId, string Question);
public record LoginResult(string Token, DateTime ExpiresAt, string FullName, string Role, string CompanyName, string Landing);

public record TestPickerItem(long Id, string Name, string ShortName, decimal Price, string Department);
// One picked test line on the registration bill. Price overrides the catalog price when set
// (the grid allows editing a line's charge); PackageId = null means a plain individual test.
public record BookingLineInput(long TestId, long? PackageId = null, decimal? Price = null, bool SampleCollected = false);
// Full registration form - identity, age Y/M/D, masters, billing, lines + packages.
// Full registration form - identity, age Y/M/D, masters, billing, lines + packages.
public record BookingForm(
    long? PatientId, string? Title, string FirstName, string? LastName, string Gender,
    int AgeYears, int AgeMonths, int AgeDays, string? Mobile, string? Email,
    string PatientType, long? ReferralDoctorId, long? HospitalId, string? Address, string? Remark,
    long? SampleCollectorId, decimal CollectorFee,
    decimal DiscountPercent, string? DiscountRemark, decimal PaidAmount, string PaymentMode,
    string DeliveryMode,
    List<BookingLineInput> Tests, List<long> PackageIds, bool PrintReceipt, DateOnly? BookingDate = null, decimal? DiscountAmount = null);

// One call fills the whole registration screen (cached 10 min server-side).
public record MasterOption(long Id, string Name, string? Extra);
public record RegTestItem(long Id, string Name, string ShortName, decimal Price, string? SampleType);
public record RegDepartmentVm(long Id, string Name, List<RegTestItem> Tests);
public record RegPackageVm(long Id, string Name, decimal Price, List<RegTestItem> Tests);
public record RegistrationDataVm(List<RegDepartmentVm> Departments, List<RegPackageVm> Packages, List<MasterOption> Doctors, List<MasterOption> Hospitals, List<MasterOption> Collectors);
// Body of the quick-add (+) buttons: Name required; Extra = doctor's hospital, unused for hospitals/collectors.
public record QuickAdd(string Name, string? Mobile, string? Extra ,string? Degree = null);
public record BookingCreatedVm(long BookingId, long LabNo, string BillNo, string PatientUid, decimal Total, decimal Discount, decimal Paid, decimal Balance, int TokenNo = 0);
// ---- Rebook / revisit ----
// PatientMatchVm: one existing patient found by the registration popup's mobile/name lookup.
// RecentVisits = this center's last few bookings for that patient - the "history" the popup shows.
public record PatientVisitVm(long BookingId, long LabNo, string BillNo, DateTime BookedAt, decimal Total, decimal Balance);
public record PatientMatchVm(long Id, string Uid, string? Title, string FirstName, string? LastName, string Gender,
    int AgeYears, int AgeMonths, int AgeDays, string? Mobile, string? Email, string? Address,
    DateTime? LastVisit, int VisitCount, List<PatientVisitVm> RecentVisits);
// Search query: keyset paging + every filter on the Search screen.
// With no filter set the repo scopes the whole page to today (lab local day).
// From/To arrive as ISO instants (the browser converts the picked local day to UTC).
public record BookingQuery(string? Search, string? Mobile, long? AfterId, int PageSize = 25,
    long? CenterId = null, string? Corporate = null, string? ReferralDoctor = null,
    bool OutstandingOnly = false, DateTimeOffset? From = null, DateTimeOffset? To = null);

// Grid row. Total = net bill (total - discount); Balance = stored DB column. IsRebook marks a rebooked visit.
public record BookingRowVm(long Id, long LabNo, string PatientName, string Uid, int AgeYears, string Gender,
    string? Referral, decimal Total, decimal Balance, DateTime BookedAt,
    string? Mobile, string? Corporate, decimal Paid, long PatientId, bool IsRebook);

// Six cards above the grid - all counts belong to the same scope as the grid (today until a filter is applied).
// Patients counts visits in that scope (same number as Bookings).
public record BookingStatsVm(int Bookings, int FullyPaid, int PartPaid, int Outstanding, decimal OutstandingAmount, decimal Collected, int Patients);
// Dropdown values for the Filters panel.
public record FilterOptionsVm(List<MasterOption> Centers, List<string> Corporates, List<string> Doctors);

// One investigation line in the View drawer. IsPackage=true means the row is the package charge itself.
// PackageId is the catalog id: set on the package row and on its component tests (price 0, not deletable alone).
public record BookingLineVm(long Id, string Name, string Department, decimal Price, string Status, DateTime BookedAt,
    bool IsPackage, bool SampleCollected, long? PackageId);
// One money row (payment or refund); each row owns one receipt.
public record BookingPaymentVm(long Id, string ReceiptNo, string Kind, decimal Amount, string Mode, DateTime PaidAt, string? Reason, string? Remark);
// Everything the View drawer needs in one call.
public record BookingDetailVm(long Id, long LabNo, string BillNo, DateTime BookedAt, bool IsRebook, long PatientId,
    string Uid, string? Title, string FirstName, string? LastName, string Gender, int AgeYears, int AgeMonths, int AgeDays,
    string? Mobile, string? Email, string? Address, string? Referral, string? Corporate, string? Remark,
    string PatientType, string DeliveryMode, decimal Total, decimal Discount, decimal Paid, decimal Refunded,
    decimal Balance, string? DiscountRemark, List<BookingLineVm> Lines, List<BookingPaymentVm> Payments);
// Header + every receipt of one patient visit (the Receipts page).
public record ReceiptListVm(long BookingId, long LabNo, string BillNo, string PatientName, string Uid,
    decimal Total, decimal Discount, decimal Paid, decimal Refunded, decimal Balance, List<BookingPaymentVm> Receipts);

// ---- Reports > Delete log ----
// Type filter: null/"All", "Test", "Package", "Receipt" or "Booking".
public record DeleteLogQuery(string? Type, string? Q, DateTime? From, DateTime? To, int Offset = 0, int Size = 20);
// One row in the Delete Log. Kind tells the UI which restore endpoint to call.
public record DeletedRowVm(string Kind, long EntityId, long BookingId, long LabNo, string BillNo, string PatientName,
    string Title, string Detail, decimal? Amount, DateTime DeletedAt, string DeletedBy, string Reason);

    // ---- Search page actions: collect / refund / add tests / edit / delete ----
// CollectForm: discount is an amount (the UI converts DIS % -> amount). A payment of 0 is
// allowed only when a discount is applied; a real payment always creates a receipt row.
public record CollectForm(decimal Amount, string PaymentMode, decimal DiscountAmount = 0, string? DiscountRemark = null);
// Refund: reason is mandatory, remark is optional.
public record RefundForm(decimal Amount, string Reason, string? Remark = null);
// Add tests/packages to an existing bill; the optional payment becomes its own receipt.
public record AddTestsForm(List<BookingLineInput> Tests, List<long> PackageIds, decimal PaidAmount = 0, string PaymentMode = "Cash");
// Soft delete: the remark is stored on the booking for the future Delete Log report.
public record DeleteBookingForm(string Reason);
// Patient edit: identity + demographics. Patients are shared across visits, so this edits every visit.
public record PatientEditForm(string? Title, string FirstName, string? LastName, string Gender,
    int AgeYears, int AgeMonths, int AgeDays, string? Mobile, string? Email, string? Address);
// Booking edit: referral/corporate are stored as NAME snapshots on the bill, so they are plain text here.
public record BookingMetaForm(string? ReferralDoctor, string? Corporate, string? Remark, string PatientType, string DeliveryMode);

public record CollectResultVm(long? PaymentId, string? ReceiptNo, decimal Paid, decimal Refunded, decimal Balance);
public record RefundResultVm(string ReceiptNo, decimal Refunded, decimal Balance);
public record AddTestsResultVm(long BookingId, decimal Total, decimal Discount, decimal Paid, decimal Balance, long? PaymentId, string? ReceiptNo);
// One receipt document: payment or refund, plus the bill position after it.
public record PaymentReceiptVm(string CompanyName, string BillNo, long LabNo, string PatientName, string Uid,
    string ReceiptNo, string Kind, decimal Amount, string Mode, DateTime PaidAt, string? Reason, string? Remark,
    decimal Total, decimal Discount, decimal Paid, decimal Refunded, decimal Balance);
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
    List<(string Test, decimal Price)> Lines, decimal Total, decimal Discount, decimal Paid, string PaymentMode, bool IsRebook = false)
{ public decimal Balance => Total - Discount - Paid; }

// ---- Masters module ----
// TestQuery:   filters for GET /master/tests  (?search=...&departmentId=...)
// TestRowVm:   one row of the tests grid (department name joined in, like the booking catalog)
// TestForm:    the add/edit form fields; validated by TestFormValidator (Step 2b)
// DepartmentVm: simple dropdown list for the tests screen filter + form
public record TestQuery(string? Search, long? DepartmentId);
public record TestRowVm(long Id, string Name, string ShortName, string Department, decimal Price, int SortOrder, bool IsActive);
public record TestForm(string Name, string ShortName, long DepartmentId, decimal Price, int SortOrder);
public record DepartmentVm(long Id, string Name, string Code, bool IsActive);


