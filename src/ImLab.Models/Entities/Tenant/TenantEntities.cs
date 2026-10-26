using ImLab.Models.Enums;

namespace ImLab.Models.Entities.Tenant;

public class Center { public long Id { get; set; } public string Name { get; set; } = ""; public string CenterType { get; set; } = "main"; public string Code { get; set; } = ""; public string? Address { get; set; } public string? Mobile { get; set; } public string? Email { get; set; } public bool IsActive { get; set; } public bool IsDeleted { get; set; } }

public class Role { public long Id { get; set; } public string Name { get; set; } = ""; public string Code { get; set; } = ""; public string Landing { get; set; } = "dashboard"; public decimal? MaxDiscountPercent { get; set; } public bool IsDeleted { get; set; } }
public class RolePermission { public long RoleId { get; set; } public string PermKey { get; set; } = ""; }
public class User
{
    public long Id { get; set; } public long CenterId { get; set; } public long RoleId { get; set; }
    public string Username { get; set; } = ""; public string FullName { get; set; } = ""; public string PasswordHash { get; set; } = "";
    public string? Mobile { get; set; } public string? Email { get; set; }
    public bool IsActive { get; set; } public int FailedAttempts { get; set; } public DateTime? LockedUntil { get; set; } public bool IsDeleted { get; set; }
}
public class Department { public long Id { get; set; } public string Name { get; set; } = ""; public string Code { get; set; } = ""; public int SortOrder { get; set; } public bool IsActive { get; set; } }
public class Test { public long Id { get; set; } public long DepartmentId { get; set; } public string Name { get; set; } = ""; public string ShortName { get; set; } = ""; public decimal Price { get; set; } public int SortOrder { get; set; } public bool IsActive { get; set; } public string? SampleType { get; set; }}
public class OutsourceLab { public long Id { get; set; } public string Name { get; set; } = ""; public bool IsActive { get; set; } }
public class Patient
{
    public long Id { get; set; } public string Uid { get; set; } = ""; public string? Title { get; set; }
    public string FirstName { get; set; } = ""; public string? LastName { get; set; } public string Gender { get; set; } = "";
    public int AgeYears { get; set; } public string? Mobile { get; set; } public string? Email { get; set; } public string? Address { get; set; }
    public DateTime CreatedAt { get; set; }
    public string FullName => $"{Title} {FirstName} {LastName}".Replace("  ", " ").Trim();
    public int AgeMonths { get; set; } public int AgeDays { get; set; }
}
public class Booking
{
    public long Id { get; set; } public long LabNo { get; set; } public string BillNo { get; set; } = "";
    public long PatientId { get; set; } public long CenterId { get; set; }
    public string? ReferralDoctor { get; set; } public string? Corporate { get; set; }
    public DateTime BookedAt { get; set; } public decimal Total { get; set; } public decimal Discount { get; set; } public decimal Paid { get; set; }
    public string PaymentMode { get; set; } = "Cash"; public long CreatedBy { get; set; } public bool IsDeleted { get; set; }
    public Patient Patient { get; set; } = null!;
    public List<BookingTest> Tests { get; set; } = new();
    public int TokenNo { get; set; } public bool IsRebook { get; set; } public string PatientType { get; set; } = "WalkIn";  public string? Remark { get; set; } public long? SampleCollectorId { get; set; } public decimal CollectorFee { get; set; } public string DeliveryMode { get; set; } = "ByHand"; public string? DiscountRemark { get; set; }

    // DB-computed (total - discount - paid). EF only reads it; the SQL migration owns the value.
    public decimal Balance { get; set; }
    // Soft delete: the row is hidden from search, but kept for the future Delete Log report.
    public DateTime? DeletedAt { get; set; } public long? DeletedBy { get; set; } public string? DeleteReason { get; set; }
}
public class BookingTest
{
    public long Id { get; set; } public long BookingId { get; set; } public long TestId { get; set; } public long DepartmentId { get; set; }
    public decimal Price { get; set; } public BookingStatus Status { get; set; } public DateTime BookedAt { get; set; }
    public bool IsOutsource { get; set; } public long? OutsourceLabId { get; set; } public OutsourceStatus OutsourceStatus { get; set; }
    public Test Test { get; set; } = null!; public Booking Booking { get; set; } = null!;
    public long? PackageId { get; set; } public bool SampleCollected { get; set; }
    // Soft delete: hidden from every list and total, but kept so Delete Log can restore it.
    public bool IsDeleted { get; set; } public DateTime? DeletedAt { get; set; } public long? DeletedBy { get; set; } public string? DeleteReason { get; set; }
}
public class BookingPayment
{
    public long Id { get; set; } public long BookingId { get; set; } public decimal Amount { get; set; }
    public string Mode { get; set; } = ""; public string Kind { get; set; } = "payment";
    public DateTime PaidAt { get; set; } public long ReceivedBy { get; set; }
    // One receipt per money row (payment or refund); reason/remark are required for a refund.
    public string? ReceiptNo { get; set; } public string? Reason { get; set; } public string? Remark { get; set; }
    // Soft delete: a voided receipt stays for audit but no longer counts in collected/refunded.
    public bool IsDeleted { get; set; } public DateTime? DeletedAt { get; set; } public long? DeletedBy { get; set; } public string? DeleteReason { get; set; }
}
public class NumberSeries { public string SeriesKey { get; set; } = ""; public long CurrentNo { get; set; } }
public class DailySummary { public long CenterId { get; set; } public DateOnly SummaryDate { get; set; } public int Bookings { get; set; } public int Delivered { get; set; } public decimal Revenue { get; set; } public decimal Outstanding { get; set; } }
public class AuditLog { public long Id { get; set; } public long? UserId { get; set; } public string Action { get; set; } = ""; public string Entity { get; set; } = ""; public string? EntityId { get; set; } public string? Detail { get; set; } public DateTime CreatedAt { get; set; } }
// --- Registration upgrade: masters, packages, and package lines on a bill ---
public class ReferralDoctor { public long Id { get; set; } public string Name { get; set; } = ""; public string? Degree { get; set; } public string? Mobile { get; set; } public string? Hospital { get; set; } public bool IsActive { get; set; } = true; }
public class Hospital { public long Id { get; set; } public string Name { get; set; } = ""; public string? Mobile { get; set; } public bool IsActive { get; set; } = true; }
public class SampleCollector { public long Id { get; set; } public string Name { get; set; } = ""; public string? Mobile { get; set; } public bool IsActive { get; set; } = true; }
public class Package { public long Id { get; set; } public string Name { get; set; } = ""; public decimal Price { get; set; } public int SortOrder { get; set; } public bool IsActive { get; set; } = true; }
public class PackageTest { public long PackageId { get; set; } public long TestId { get; set; } }
public class BookingPackage
{
    public long Id { get; set; } public long BookingId { get; set; } public long PackageId { get; set; }
    public string Name { get; set; } = ""; public decimal Price { get; set; }
    // Soft delete: the package charge and its component test rows are hidden together.
    public bool IsDeleted { get; set; } public DateTime? DeletedAt { get; set; } public long? DeletedBy { get; set; } public string? DeleteReason { get; set; }
}