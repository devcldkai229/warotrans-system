using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Transportation.Entities;

namespace WaroTrans.Transportation.Persistence.Configurations;

public sealed class StockPostingConfiguration : IEntityTypeConfiguration<StockPosting>
{
    public void Configure(EntityTypeBuilder<StockPosting> builder)
    {
        builder.ToTable("stock_postings");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Key).HasMaxLength(120).IsRequired();
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.LastError).HasMaxLength(500);

        builder.HasIndex(x => x.Key).IsUnique();
        builder.HasIndex(x => x.CreatedAt).HasFilter("posted_at IS NULL");
    }
}
