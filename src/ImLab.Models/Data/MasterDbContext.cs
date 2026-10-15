using ImLab.Models.Entities.Master;
using ImLab.Models.Entities.Tenant;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Data;

public sealed class MasterDbContext(DbContextOptions<MasterDbContext> options) : DbContext(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<DbServer> DbServers => Set<DbServer>();
    public DbSet<ConfigItem> Config => Set<ConfigItem>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Tenant>().ToTable("tenants");
        b.Entity<DbServer>().ToTable("db_servers");
        b.Entity<ConfigItem>().ToTable("config");
        foreach (var e in b.Model.GetEntityTypes())
            foreach (var pr in e.GetProperties()) pr.SetColumnName(SnakeCase.To(pr.Name));
    }
}
