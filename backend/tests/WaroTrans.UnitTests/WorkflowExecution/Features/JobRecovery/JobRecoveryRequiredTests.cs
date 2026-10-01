using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.UnitTests.WorkflowExecution.Features.JobRecovery;

public class JobRecoveryRequiredTests
{
    [Fact]
    public void MarkRecoveryRequired_from_RUNNING_sets_RECOVERY_REQUIRED()
    {
        var job = new Job
        {
            Id = Guid.NewGuid(),
            Status = JobStatus.RUNNING
        };

        job.MarkRecoveryRequired("robot_failed", "Container onboard");

        Assert.Equal(JobStatus.RECOVERY_REQUIRED, job.Status);
        Assert.Equal("robot_failed", job.FailureCode);
        Assert.Equal("Container onboard", job.FailureMessage);
    }

    [Fact]
    public void MarkRecoveryRequired_from_CREATED_throws()
    {
        var job = new Job { Status = JobStatus.CREATED };

        Assert.Throws<InvalidOperationException>(() => job.MarkRecoveryRequired());
    }
}
