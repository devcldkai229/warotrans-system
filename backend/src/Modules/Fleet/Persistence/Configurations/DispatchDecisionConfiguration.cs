using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class DispatchDecisionConfiguration : IEntityTypeConfiguration<DispatchDecision>
{
    public void Configure(EntityTypeBuilder<DispatchDecision> builder)
    {
        builder.ToTable("dispatch_decisions");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.CandidateEvaluations).HasColumnType("jsonb").IsRequired();

        builder.HasIndex(x => x.JobId);
    }
}
