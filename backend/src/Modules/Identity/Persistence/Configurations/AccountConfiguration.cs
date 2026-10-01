using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Identity.Entities;

namespace WaroTrans.Identity.Persistence.Configurations;

public sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("accounts");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Username).HasMaxLength(255).IsRequired();
        builder.Property(x => x.Email).HasMaxLength(255).IsRequired();
        builder.Property(x => x.PasswordHash).HasMaxLength(255).IsRequired();
        builder.Property(x => x.FullName).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Role).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.HasIndex(x => x.Username).IsUnique();
        builder.HasIndex(x => x.Email).IsUnique();
    }
}
