using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.WorkflowExecution.Features.HandoverStops;

public static class HandoverStopEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/handover-stops", async (bool? mine, HandoverStopsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(new { items = await handler.ListAsync(mine == true, cancellationToken) }))
            .RequirePermission(Permissions.JobOperate)
            .WithName("ListHandoverStops");

        MapChange("claim", HandoverStopAction.Claim);
        MapChange("begin", HandoverStopAction.Begin);
        MapChange("release", HandoverStopAction.Release);
        MapChange("heartbeat", HandoverStopAction.Heartbeat);
        MapChange("extend", HandoverStopAction.Extend);

        group.MapGet("/handover-stops/work-zone", async (HandoverStopsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(new { workZone = await handler.GetWorkZoneAsync(cancellationToken) }))
            .RequirePermission(Permissions.JobOperate).WithName("GetMyHandoverWorkZone");

        group.MapPut("/handover-stops/work-zone", async (SelectWorkZoneRequest request, HandoverStopsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(new { workZone = await handler.SetWorkZoneAsync(request.ZoneId, cancellationToken) }))
            .RequirePermission(Permissions.JobOperate).WithName("SetMyHandoverWorkZone");

        group.MapPost("/jobs/{jobId:guid}/handover-stops/{id:guid}/confirm", async (
                Guid jobId, Guid id, ConfirmHandoverStopRequest request, HandoverStopsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ConfirmAsync(jobId, id, request, cancellationToken)))
            .RequirePermission(Permissions.JobOperate)
            .Audited("job.handover_stop_confirm", "JOB_TASK", "id")
            .WithName("ConfirmHandoverStop");

        void MapChange(string path, HandoverStopAction action)
        {
            var endpoint = group.MapPost($"/jobs/{{jobId:guid}}/handover-stops/{{id:guid}}/{path}", async (
                    Guid jobId, Guid id, HandoverStopVersionRequest request, HandoverStopsHandler handler, CancellationToken cancellationToken) =>
                    Results.Ok(await handler.ChangeAsync(jobId, id, request, action, cancellationToken)))
                .RequirePermission(Permissions.JobOperate)
                .WithName($"{action}HandoverStop");
            if (action != HandoverStopAction.Heartbeat)
                endpoint.Audited($"job.handover_stop_{path}", "JOB_TASK", "id");
        }
    }
}
