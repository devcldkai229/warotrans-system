using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.GetWorkflow;
using WaroTrans.WorkflowExecution.Features.ListWorkflows;
using WaroTrans.WorkflowExecution.Features.WorkflowVisibility;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.UnitTests.WorkflowExecution.Features;

/// <summary>Robot care workflows (charging, return to park) and their Jobs are hidden from Staff accounts.</summary>
public sealed class StaffWorkflowVisibilityTests
{
    private static readonly ICurrentUser Staff = new FakeCurrentUser(role: "STAFF");
    private static readonly ICurrentUser Admin = new FakeCurrentUser(role: "ADMIN");
    private static readonly ICurrentUser Technician = new FakeCurrentUser(role: "TECHNICIAN");

    private static Workflow Add(WorkflowExecutionDbContext db, string code, int version, bool staffVisible)
    {
        var workflow = new Workflow
        {
            Id = Guid.NewGuid(), Code = code, VersionNo = version, Name = code, Status = WorkflowStatus.PUBLISHED,
            StaffVisible = staffVisible, CreatedAt = DateTimeOffset.UtcNow
        };
        db.Workflows.Add(workflow);
        return workflow;
    }

    private static async Task<List<string>> ListedCodesAsync(WorkflowExecutionDbContext db, ICurrentUser user)
    {
        var result = await new ListWorkflowsHandler(db, user).HandleAsync(null, null, default);
        return JsonSerializer.SerializeToElement(result).GetProperty("items").EnumerateArray()
            .Select(i => i.GetProperty("Code").GetString()!).ToList();
    }

    [Fact]
    public async Task Staff_do_not_see_hidden_workflows_admins_and_technicians_do()
    {
        await using var db = JobRuntimeTestDb.CreateDb();
        Add(db, "INBOUND", 1, staffVisible: true);
        Add(db, "ROBOT_CHARGING", 1, staffVisible: false);
        await db.SaveChangesAsync();

        Assert.Equal(["INBOUND"], await ListedCodesAsync(db, Staff));
        Assert.Equal(["INBOUND", "ROBOT_CHARGING"], await ListedCodesAsync(db, Admin));
        Assert.Equal(["INBOUND", "ROBOT_CHARGING"], await ListedCodesAsync(db, Technician));
    }

    [Fact]
    public async Task A_hidden_workflow_is_not_found_for_staff()
    {
        await using var db = JobRuntimeTestDb.CreateDb();
        var charging = Add(db, "ROBOT_CHARGING", 1, staffVisible: false);
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<NotFoundException>(() => new GetWorkflowHandler(db, Staff).HandleAsync(charging.Id, default));
        Assert.Equal("workflow_not_found", error.Code);
        Assert.False((await new GetWorkflowHandler(db, Admin).HandleAsync(charging.Id, default)).StaffVisible);
    }

    [Fact]
    public async Task Staff_see_only_jobs_of_workflows_shown_to_them()
    {
        await using var db = JobRuntimeTestDb.CreateDb();
        var inbound = Add(db, "INBOUND", 1, staffVisible: true);
        var charging = Add(db, "ROBOT_CHARGING", 1, staffVisible: false);
        var cargoJob = new Job { Id = Guid.NewGuid(), JobNo = "JOB-1", WorkflowId = inbound.Id, ProvisioningKey = "a" };
        var chargeJob = new Job { Id = Guid.NewGuid(), JobNo = "JOB-2", WorkflowId = charging.Id, ProvisioningKey = "b" };
        db.Jobs.AddRange(cargoJob, chargeJob);
        await db.SaveChangesAsync();

        Assert.Equal(["JOB-1"], await db.Jobs.Visible(db, Staff).Select(j => j.JobNo).ToListAsync());
        Assert.Equal(2, await db.Jobs.Visible(db, Technician).CountAsync());
        Assert.False(await new JobStaffVisibility(db).IsStaffVisibleAsync(chargeJob.Id));
        Assert.True(await new JobStaffVisibility(db).IsStaffVisibleAsync(cargoJob.Id));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            StaffWorkflowVisibility.EnsureJobVisibleAsync(db, chargeJob.Id, charging.Id, Staff, default));
    }

    private sealed class NoAudit : IAuditTrail
    {
        public List<AuditEntry> Entries { get; } = [];

        public Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default)
        {
            Entries.Add(entry);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Hiding_a_workflow_hides_every_version_of_its_code_and_is_audited_once()
    {
        await using var db = JobRuntimeTestDb.CreateDb();
        var v1 = Add(db, "ROBOT_RETURN_TO_PARK", 1, staffVisible: true);
        Add(db, "ROBOT_RETURN_TO_PARK", 2, staffVisible: true);
        Add(db, "INBOUND", 1, staffVisible: true);
        await db.SaveChangesAsync();
        var audit = new NoAudit();

        var result = await new SetStaffVisibilityHandler(db, audit).HandleAsync(v1.Id, false, default);
        await new SetStaffVisibilityHandler(db, audit).HandleAsync(v1.Id, false, default);

        Assert.Equal(2, result.Versions);
        Assert.All(await db.Workflows.Where(w => w.Code == "ROBOT_RETURN_TO_PARK").ToListAsync(), w => Assert.False(w.StaffVisible));
        Assert.True((await db.Workflows.SingleAsync(w => w.Code == "INBOUND")).StaffVisible);
        Assert.Single(audit.Entries);
    }
}
