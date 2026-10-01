using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class WorkflowTaskConfiguration : IEntityTypeConfiguration<WorkflowTask>
{
    public void Configure(EntityTypeBuilder<WorkflowTask> builder)
    {
        builder.ToTable("workflow_tasks");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TaskKey).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(255).IsRequired();

        builder.HasMany(x => x.Steps)
            .WithOne(x => x.WorkflowTask)
            .HasForeignKey(x => x.WorkflowTaskId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
