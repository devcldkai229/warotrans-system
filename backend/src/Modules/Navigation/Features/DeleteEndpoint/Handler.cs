using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.DeleteEndpoint;

public sealed class DeleteEndpointHandler(NavigationDbContext dbContext)
{
    public async Task HandleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var endpoint = await dbContext.Endpoints
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Endpoint with ID '{id}' was not found.", "endpoint_not_found");

        var mapStatus = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == endpoint.MapVersionId)
            .Select(m => (MapStatus?)m.Status)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(
                $"MapVersion with ID '{endpoint.MapVersionId}' was not found.",
                "map_version_not_found");

        if (mapStatus != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Endpoints can only be deleted from DRAFT map versions (current status: {mapStatus}).",
                "map_version_not_draft");
        }

        var inGroup = await dbContext.EndpointGroupMembers
            .AsNoTracking()
            .AnyAsync(m => m.EndpointId == id, cancellationToken);
        if (inGroup)
        {
            throw new ConflictException(
                $"Endpoint '{endpoint.Code}' is a member of an EndpointGroup and cannot be deleted.",
                "endpoint_in_use");
        }

        dbContext.Endpoints.Remove(endpoint);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.ForeignKeyViolation
        })
        {
            throw new ConflictException(
                $"Endpoint '{endpoint.Code}' is referenced elsewhere and cannot be deleted.",
                "endpoint_in_use");
        }
    }
}
