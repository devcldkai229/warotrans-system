using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public sealed class CodeSequenceDbContextFactory : IDesignTimeDbContextFactory<CodeSequenceDbContext>
{
    public CodeSequenceDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<CodeSequenceDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new CodeSequenceDbContext(options);
    }
}
