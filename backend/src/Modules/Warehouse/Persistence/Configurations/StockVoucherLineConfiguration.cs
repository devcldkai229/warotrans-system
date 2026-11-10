using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class StockVoucherLineConfiguration : IEntityTypeConfiguration<StockVoucherLine>
{
    public void Configure(EntityTypeBuilder<StockVoucherLine> builder)
    {
        builder.ToTable("stock_voucher_lines");
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.StockVoucherId, x.LineNo }).IsUnique();
        builder.HasIndex(x => new { x.StockVoucherId, x.ContainerId }).IsUnique();
        builder.HasIndex(x => x.ContainerId);

        builder.HasOne(x => x.Container)
            .WithMany()
            .HasForeignKey(x => x.ContainerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.Product)
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
