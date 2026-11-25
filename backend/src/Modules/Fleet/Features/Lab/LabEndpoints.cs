using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Fleet.Features.Lab;

/// <summary>/api/lab: the Fault Injection Lab. Mapped only when Lab:Enabled (otherwise every route is a 404).</summary>
public static class LabEndpoints
{
    public static IEndpointRouteBuilder MapLab(this IEndpointRouteBuilder endpoints, bool enabled)
    {
        if (!enabled)
        {
            return endpoints;
        }

        var group = endpoints.MapGroup("/api/lab").RequirePermission(Permissions.LabOperate);
        group.MapGet("/scenarios", () => Results.Ok(LabCatalog.All)).WithName("ListLabScenarios");
        group.MapGet("/injections", (LabInjectionService lab) => Results.Ok(lab.List())).WithName("ListLabInjections");
        group.MapPost("/injections", async (LabInjectRequest request, LabInjectionService lab, ICurrentUser user, CancellationToken ct) =>
                Results.Ok(await lab.InjectAsync(request, user.Username, ct)))
            .WithName("InjectLabFault")
            .WithDescription("Injects one fault (test robots only). Robot faults end by themselves after ttlSeconds.");
        group.MapPost("/injections/{id:guid}/stop", async (Guid id, LabInjectionService lab, CancellationToken ct) =>
                Results.Ok(await lab.StopAsync(id, "STOPPED", ct)))
            .WithName("StopLabFault");
        return endpoints;
    }
}

/// <summary>Ends lab faults whose TTL has passed, once a second.</summary>
internal sealed class LabExpiryHostedService(
    LabInjectionService lab,
    IOptions<LabOptions> options,
    TimeProvider clock,
    ILogger<LabExpiryHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        logger.LogWarning("Fault Injection Lab is ENABLED on this Host (test bench only)");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await lab.ExpireAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Lab expiry pass failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(1), clock, stoppingToken);
        }
    }
}
