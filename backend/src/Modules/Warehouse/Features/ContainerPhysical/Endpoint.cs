using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ContainerPhysical;

public sealed record ContainerPhysicalDto(decimal? WeightKg, double? LengthM, double? WidthM);

/// <summary>FL-03: weight and size of a Container, as measured.</summary>
public static class ContainerPhysicalEndpoint
{
    public static RouteGroupBuilder MapContainerPhysical(this RouteGroupBuilder group)
    {
        group.MapGet("/containers/{id:guid}/physical", async (Guid id, WarehouseDbContext db, CancellationToken cancellationToken) =>
            {
                var values = await db.Containers.AsNoTracking()
                    .Where(c => c.Id == id)
                    .Select(c => new ContainerPhysicalDto(c.WeightKg, c.LengthM, c.WidthM))
                    .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new NotFoundException($"Container '{id}' was not found.", "container_not_found");
                return Results.Ok(values);
            })
            .RequirePermission(Permissions.WarehouseRead)
            .WithName("GetContainerPhysical")
            .WithSummary("Weight and size of a Container; empty when not measured");

        group.MapPut("/containers/{id:guid}/physical", async (
                Guid id, ContainerPhysicalDto request, WarehouseDbContext db, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                if (request.WeightKg is <= 0 || request.LengthM is <= 0 || request.WidthM is <= 0)
                {
                    throw new DomainValidationException("Weight and size must be above zero, or empty when not known.", "container_physical_invalid");
                }

                var container = await db.Containers.FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
                    ?? throw new NotFoundException($"Container '{id}' was not found.", "container_not_found");
                container.WeightKg = request.WeightKg;
                container.LengthM = request.LengthM;
                container.WidthM = request.WidthM;
                container.UpdatedAt = clock.GetUtcNow();
                await db.SaveChangesAsync(cancellationToken);
                return Results.Ok(request);
            })
            .RequirePermission(Permissions.ContainerCreate)
            .Audited("container.physical_set", "CONTAINER", "id")
            .WithName("SetContainerPhysical")
            .WithSummary("Set the measured weight and size of a Container");

        return group;
    }
}
