using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Fleet.Features.TechnicalTickets;

/// <summary>Technical tickets (phiếu kỹ thuật). Read with robot.read (a Technician sees their robots only); written with robot.maintenance.</summary>
public static class TechnicalTicketEndpoints
{
    public static RouteGroupBuilder MapTechnicalTickets(this RouteGroupBuilder group)
    {
        group.MapGet("/tickets", async (
                Guid? robotId, string? type, string? status, string? search, DateTimeOffset? from, DateTimeOffset? to, int? skip, int? take,
                TechnicalTicketService tickets, CancellationToken ct) =>
            {
                var (items, total) = await tickets.ListAsync(
                    new TechnicalTicketQuery(robotId, type, status, search, from, to, skip ?? 0, take ?? 50), ct);
                return Results.Ok(new { items, total, skip = Math.Max(0, skip ?? 0), take = Math.Clamp(take ?? 50, 1, TechnicalTicketService.MaxTake) });
            })
            .RequirePermission(Permissions.RobotRead)
            .WithName("ListTechnicalTickets")
            .WithSummary("Technical tickets, newest first (filters: robotId, type, status, search, from, to)")
            .WithTags("Technical tickets");

        group.MapGet("/tickets/{ticketId:guid}", async (Guid ticketId, TechnicalTicketService tickets, CancellationToken ct) =>
                Results.Ok(await tickets.GetAsync(ticketId, ct)))
            .RequirePermission(Permissions.RobotRead)
            .WithName("GetTechnicalTicket")
            .WithTags("Technical tickets");

        group.MapPost("/robots/{id:guid}/tickets", async (Guid id, CreateTicketRequest request, TechnicalTicketService tickets, CancellationToken ct) =>
                Results.Ok(await tickets.CreateAsync(id, request, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .RequireRobotScope()
            .WithName("CreateTechnicalTicket")
            .WithDescription("Opens a ticket on the robot: MAINTENANCE, DIAGNOSTIC, INSPECTION, REPAIR or TECHNICAL_REPORT. The robot's status and health are kept with it.")
            .WithTags("Technical tickets");

        group.MapPatch("/tickets/{ticketId:guid}", async (Guid ticketId, UpdateTicketRequest request, TechnicalTicketService tickets, CancellationToken ct) =>
                Results.Ok(await tickets.UpdateAsync(ticketId, request, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .WithName("UpdateTechnicalTicket")
            .WithTags("Technical tickets");

        group.MapPost("/tickets/{ticketId:guid}/actions", async (Guid ticketId, AddTicketActionRequest request, TechnicalTicketService tickets, CancellationToken ct) =>
                Results.Ok(await tickets.AddActionAsync(ticketId, request, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .WithName("AddTechnicalTicketAction")
            .WithTags("Technical tickets");

        group.MapPost("/tickets/{ticketId:guid}/complete", async (Guid ticketId, CompleteTicketRequest request, TechnicalTicketService tickets, CancellationToken ct) =>
                Results.Ok(await tickets.CompleteAsync(ticketId, request, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .WithName("CompleteTechnicalTicket")
            .WithDescription("Result: PASSED, FIXED, NEEDS_FOLLOW_UP or FAILED. A maintenance ticket closes when the robot returns to service.")
            .WithTags("Technical tickets");

        group.MapPost("/tickets/{ticketId:guid}/cancel", async (Guid ticketId, CancelTicketRequest request, TechnicalTicketService tickets, CancellationToken ct) =>
                Results.Ok(await tickets.CancelAsync(ticketId, request, ct)))
            .RequirePermission(Permissions.RobotMaintenance)
            .WithName("CancelTechnicalTicket")
            .WithTags("Technical tickets");

        return group;
    }
}
