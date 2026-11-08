using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Identity.Entities;

namespace WaroTrans.Identity.Persistence.Configurations;

public sealed class TechnicianRobotScopeConfiguration : IEntityTypeConfiguration<TechnicianRobotScope>
{
    public void Configure(EntityTypeBuilder<TechnicianRobotScope> builder)
    {
        builder.ToTable("technician_robot_scopes");
        builder.HasKey(x => new { x.AccountId, x.RobotId });
        builder.HasIndex(x => x.RobotId);

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(x => x.AccountId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
