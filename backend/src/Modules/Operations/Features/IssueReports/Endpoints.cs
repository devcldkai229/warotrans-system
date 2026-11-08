using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;

namespace WaroTrans.Operations.Features.IssueReports;

/// <summary>/api/operations/issues: report, follow and resolve problems (OPS-01).</summary>
public static class IssueEndpoints
{
    public static RouteGroupBuilder MapIssueReports(this RouteGroupBuilder group)
    {
        group.MapPost("/issues", async (
                CreateIssueRequest request,
                IValidator<CreateIssueRequest> validator,
                IssueService issues,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid) return validation.ToValidationProblem();
                var created = await issues.CreateAsync(request, cancellationToken);
                return TypedResults.Created($"/api/operations/issues/{created.Id}", created);
            })
            .RequirePermission(Permissions.IssueCreate)
            .WithName("CreateIssue")
            .WithSummary("Report an issue (container, transport, job, robot, storage)");

        group.MapGet("/issues", async (
                string? status,
                string? issueType,
                string? severity,
                Guid? assigneeId,
                Guid? jobId,
                Guid? robotId,
                bool? mine,
                int? skip,
                int? take,
                IssueService issues,
                CancellationToken cancellationToken) =>
                Results.Ok(await issues.ListAsync(
                    new ListIssuesQuery(status, issueType, severity, assigneeId, jobId, robotId, mine ?? false, skip ?? 0, take ?? 30),
                    cancellationToken)))
            .RequirePermission(Permissions.IssueRead)
            .WithName("ListIssues")
            .WithDescription("Admins see every issue; Technicians theirs and those of their robots; Staff the ones they reported or are assigned to.");

        group.MapGet("/issues/{id:guid}", async (Guid id, IssueService issues, CancellationToken cancellationToken) =>
                Results.Ok(await issues.GetAsync(id, cancellationToken)))
            .RequirePermission(Permissions.IssueRead)
            .WithName("GetIssue");

        group.MapPost("/issues/{id:guid}/assign", async (
                Guid id,
                AssignIssueRequest request,
                IssueService issues,
                CancellationToken cancellationToken) =>
                Results.Ok(await issues.AssignAsync(id, request, cancellationToken)))
            .RequirePermission(Permissions.IssueManage)
            .WithName("AssignIssue");

        group.MapPost("/issues/{id:guid}/transition", async (
                Guid id,
                TransitionIssueRequest request,
                IValidator<TransitionIssueRequest> validator,
                IssueService issues,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid) return validation.ToValidationProblem();
                return Results.Ok(await issues.TransitionAsync(id, request, cancellationToken));
            })
            .RequirePermission(Permissions.IssueManage)
            .WithName("TransitionIssue")
            .WithDescription("OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED (needs a resolution) → CLOSED; RESOLVED may be reopened to IN_PROGRESS. `expectedVersion` guards concurrent edits (409 issue_version_conflict).");

        group.MapPost("/issues/{id:guid}/evidence", async (
                Guid id,
                AddEvidenceRequest request,
                IValidator<AddEvidenceRequest> validator,
                IssueService issues,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid) return validation.ToValidationProblem();
                return Results.Ok(await issues.AddEvidenceAsync(id, request, cancellationToken));
            })
            .RequirePermission(Permissions.IssueCreate)
            .WithName("AddIssueEvidence")
            .WithDescription("Evidence is metadata (kind, URI, MIME type, note); the file itself is stored elsewhere.");

        return group;
    }
}
