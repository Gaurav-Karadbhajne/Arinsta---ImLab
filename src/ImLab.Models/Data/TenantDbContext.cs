using ImLab.Models.Entities.Tenant;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace ImLab.Models.Data;

/// <summary>One lab's database. Only the connection string differs between labs, so the EF model is built once and shared.</summary>
public sealed class TenantDbContext(ITenantContext tenant) : DbContext
{
    public DbSet<ConfigItem> Config => Set<ConfigItem>();
    public DbSet<Center> Centers => Set<Center>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Test> Tests => Set<Test>();
    public DbSet<OutsourceLab> OutsourceLabs => Set<OutsourceLab>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingTest> BookingTests => Set<BookingTest>();
    public DbSet<BookingPayment> BookingPayments => Set<BookingPayment>();
    public DbSet<NumberSeries> NumberSeries => Set<NumberSeries>();
    public DbSet<DailySummary> DailySummary => Set<DailySummary>();
    public DbSet<AuditLog> AuditLog => Set<AuditLog>();

    public DbSet<ReferralDoctor> ReferralDoctors => Set<ReferralDoctor>();
    public DbSet<Hospital> Hospitals => Set<Hospital>();
    public DbSet<SampleCollector> SampleCollectors => Set<SampleCollector>();
    public DbSet<Package> Packages => Set<Package>();
    public DbSet<PackageTest> PackageTests => Set<PackageTest>();
    public DbSet<BookingPackage> BookingPackages => Set<BookingPackage>();
    protected override void OnConfiguring(DbContextOptionsBuilder o)
    {
        var (host, port) = SplitHostPort(tenant.Host);
        var cs = new MySqlConnectionStringBuilder
        {
            Server = host, Port = port, Database = tenant.Database, UserID = tenant.User, Password = tenant.Password,
            Pooling = true, MinimumPoolSize = 0, MaximumPoolSize = 20, ConnectionIdleTimeout = 60, ConnectionTimeout = 5
        }.ConnectionString;
        o.UseMySql(cs, new MySqlServerVersion(new Version(8, 0, 36)), m => m.EnableRetryOnFailure(2))
         .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
    }

    // db_servers.host may include a port ("localhost:3307"); anything else defaults to 3306.
    private static (string Host, uint Port) SplitHostPort(string value)
    {
        var i = value.LastIndexOf(':');
        if (i > 0 && uint.TryParse(value[(i + 1)..], out var port)) return (value[..i], port);
        return (value, 3306);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<RolePermission>().HasKey(x => new { x.RoleId, x.PermKey });
        b.Entity<NumberSeries>().HasKey(x => x.SeriesKey);
        b.Entity<DailySummary>().HasKey(x => new { x.CenterId, x.SummaryDate });
        b.Entity<PackageTest>().HasKey(x => new { x.PackageId, x.TestId });   // join table: pair of ids IS the primary key
        b.Entity<Patient>().Ignore(x => x.FullName);

        // balance is a STORED generated column in MySQL: read-only for EF, so it is never inserted/updated.
        b.Entity<Booking>().Property(x => x.Balance).HasComputedColumnSql("total - discount - paid", stored: true);
        b.Entity<BookingTest>().HasOne(x => x.Booking).WithMany(x => x.Tests).HasForeignKey(x => x.BookingId);
        b.Entity<BookingTest>().HasOne(x => x.Test).WithMany().HasForeignKey(x => x.TestId);
        b.Entity<Booking>().HasOne(x => x.Patient).WithMany().HasForeignKey(x => x.PatientId);
        SnakeCase.Apply(this, b);
    }
}
