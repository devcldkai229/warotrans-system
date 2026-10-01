using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public sealed class CodeSequenceConfiguration : IEntityTypeConfiguration<CodeSequence>
{
    public void Configure(EntityTypeBuilder<CodeSequence> builder)
    {
        builder.ToTable("code_sequences", "public");
        builder.HasKey(x => x.Key);
        builder.Property(x => x.Key).HasMaxLength(100).HasColumnName("key");
        builder.Property(x => x.NextValue).HasColumnName("next_value");
        builder.Property(x => x.DayBucket).HasColumnName("day_bucket");
    }
}
