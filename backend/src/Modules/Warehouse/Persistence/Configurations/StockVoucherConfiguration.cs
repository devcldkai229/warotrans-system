using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class StockVoucherConfiguration : IEntityTypeConfiguration<StockVoucher>
{
    public void Configure(EntityTypeBuilder<StockVoucher> builder)
    {
        builder.ToTable("stock_vouchers");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.ReferenceNo).HasMaxLength(100);
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.UpdatedAt).IsConcurrencyToken();

        builder.HasIndex(x => x.Code).IsUnique();
        builder.HasIndex(x => new { x.WarehouseId, x.Type, x.Status });

        builder.HasMany(x => x.Lines)
            .WithOne(x => x.StockVoucher)
            .HasForeignKey(x => x.StockVoucherId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
