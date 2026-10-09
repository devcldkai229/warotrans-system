using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Persistence;

public sealed class NavigationDbContext(DbContextOptions<NavigationDbContext> options) : DbContext(options)
{
    public DbSet<MapVersion> MapVersions => Set<MapVersion>();
    public DbSet<Endpoint> Endpoints => Set<Endpoint>();
    public DbSet<EndpointGroup> EndpointGroups => Set<EndpointGroup>();
    public DbSet<EndpointGroupMember> EndpointGroupMembers => Set<EndpointGroupMember>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<Edge> Edges => Set<Edge>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("navigation");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(NavigationDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();

        if (Database.ProviderName == "Microsoft.EntityFrameworkCore.InMemory")
        {
            modelBuilder.Entity<Zone>()
                .Property(x => x.Geometry)
                .HasConversion(
                    v => v.RootElement.GetRawText(),
                    v => JsonDocument.Parse(v, default));

            modelBuilder.Entity<Edge>()
                .Property(x => x.Geometry)
                .HasConversion(
                    v => v.RootElement.GetRawText(),
                    v => JsonDocument.Parse(v, default));
        }
    }
}
