using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence;

public sealed class WorkflowExecutionDbContext(DbContextOptions<WorkflowExecutionDbContext> options) : DbContext(options)
{
    public DbSet<Workflow> Workflows => Set<Workflow>();
    public DbSet<WorkflowTask> WorkflowTasks => Set<WorkflowTask>();
    public DbSet<WorkflowStep> WorkflowSteps => Set<WorkflowStep>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobTask> JobTasks => Set<JobTask>();
    public DbSet<JobStep> JobSteps => Set<JobStep>();
    public DbSet<HandoverConfirmation> HandoverConfirmations => Set<HandoverConfirmation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("execution");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WorkflowExecutionDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}
