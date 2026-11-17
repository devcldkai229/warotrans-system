using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder;

namespace WaroTrans.Evidence.Recorder.Persistence;

/// <summary><c>dotnet ef migrations add X --project src/WaroTrans.Evidence/Recorder</c>: the Recorder owns the Evidence migrations.</summary>
public sealed class DesignTimeEvidenceDbContextFactory : IDesignTimeDbContextFactory<EvidenceDbContext>
{
    public EvidenceDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Evidence")
            ?? "Host=127.0.0.1;Port=5433;Database=warotrans_evidence;Username=warotrans;Password=warotrans";
        var options = new DbContextOptionsBuilder<EvidenceDbContext>()
            .UseNpgsql(connectionString, npgsql => npgsql
                .MigrationsAssembly(RecorderOptions.MigrationsAssembly)
                .MigrationsHistoryTable("__ef_migrations_history", EvidenceDbContext.Schema))
            .Options;
        return new EvidenceDbContext(options);
    }
}
