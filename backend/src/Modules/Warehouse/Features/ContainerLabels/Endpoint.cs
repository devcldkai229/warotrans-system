using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;

namespace WaroTrans.Warehouse.Features.ContainerLabels;

public sealed record IssueContainerLabelsRequest(int Count);
public sealed record IssueContainerLabelsResponse(IReadOnlyList<string> Codes, DateTimeOffset IssuedAt);

/// <summary>
/// Pre-printed container labels: codes taken from the container sequence so they never clash with a created
/// container, but no Container row is made (a container always has its product). Scanning one while a product is
/// chosen creates that container (POST /containers with LabelBarcode).
/// </summary>
public static class IssueContainerLabelsEndpoint
{
    public const int MaxLabels = 200;

    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/container-labels", async (IssueContainerLabelsRequest request, IBusinessCodeGenerator codes, CancellationToken cancellationToken) =>
        {
            if (request.Count is < 1 or > MaxLabels)
                throw new DomainValidationException($"Print between 1 and {MaxLabels} labels at a time.", "label_count_invalid");
            var issued = await codes.NextContainerCodesAsync(request.Count, cancellationToken: cancellationToken);
            return Results.Ok(new IssueContainerLabelsResponse(issued, DateTimeOffset.UtcNow));
        })
        .RequirePermission(Permissions.ContainerCreate)
        .Audited("container.labels.issued", "CONTAINER", null)
        .Produces<IssueContainerLabelsResponse>(StatusCodes.Status200OK)
        .WithName("IssueContainerLabels")
        .WithSummary("Issue container codes for pre-printed labels")
        .WithDescription("Takes Count codes (1..200) from the daily container sequence. Nothing else is written; a label becomes a container when it is scanned with a product.");
    }
}
