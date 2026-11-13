using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class ContainerConfiguration : IEntityTypeConfiguration<Container>
{
    public void Configure(EntityTypeBuilder<Container> builder)
    {
        builder.ToTable("containers", table =>
        {
            table.HasCheckConstraint("ck_containers_contents", "(contents_quantity IS NULL AND contents_unit IS NULL) OR (contents_quantity IS NOT NULL AND contents_quantity > 0 AND contents_unit IS NOT NULL AND length(btrim(contents_unit)) > 0)");
            table.HasCheckConstraint("ck_containers_creation_receipt", "(creation_request_id IS NULL AND creation_request_hash IS NULL AND creation_ordinal IS NULL AND creation_group_key IS NULL AND creation_group_ordinal IS NULL) OR (creation_request_id IS NOT NULL AND creation_request_hash IS NOT NULL AND length(creation_request_hash) = 64 AND creation_ordinal IS NOT NULL AND creation_ordinal > 0 AND creation_group_key IS NOT NULL AND length(btrim(creation_group_key)) > 0 AND creation_group_ordinal IS NOT NULL AND creation_group_ordinal > 0 AND contents_quantity IS NOT NULL AND contents_unit IS NOT NULL)");
        });
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Barcode).HasMaxLength(100).IsRequired();
        builder.Property(x => x.SupplierPackageBarcode).HasMaxLength(128);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.UpdatedAt).IsConcurrencyToken();

        builder.HasIndex(x => x.Barcode).IsUnique();
        builder.Property(x => x.ContentsQuantity).HasPrecision(18, 3);
        builder.Property(x => x.ContentsUnit).HasMaxLength(32);
        builder.Property(x => x.CreationRequestHash).HasMaxLength(64);
        builder.Property(x => x.CreationGroupKey).HasMaxLength(64);
        builder.HasIndex(x => new { x.CreationRequestId, x.CreationOrdinal })
            .HasDatabaseName("ux_containers_creation_request").IsUnique()
            .HasFilter("creation_request_id IS NOT NULL");

        builder.HasOne(x => x.Product)
            .WithMany()
            .HasForeignKey(x => x.ProductId);

        builder.HasOne(x => x.CurrentStorageLocation)
            .WithMany()
            .HasForeignKey(x => x.CurrentStorageLocationId);
    }
}
