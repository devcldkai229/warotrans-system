using Microsoft.EntityFrameworkCore;

namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public sealed class CodeSequenceDbContext(DbContextOptions<CodeSequenceDbContext> options) : DbContext(options)
{
    public DbSet<CodeSequence> CodeSequences => Set<CodeSequence>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("public");
        modelBuilder.ApplyConfiguration(new CodeSequenceConfiguration());
    }
}
