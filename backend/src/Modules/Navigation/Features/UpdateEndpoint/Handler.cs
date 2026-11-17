using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;

namespace WaroTrans.Navigation.Features.UpdateEndpoint;

public sealed class UpdateEndpointHandler(
    NavigationDbContext dbContext,
    EndpointStorage endpointStorage,
    IValidator<UpdateEndpointRequest> validator)
{
    public async Task<UpdateEndpointResponse> HandleAsync(
        Guid id,
        UpdateEndpointRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var endpoint = await dbContext.Endpoints
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (endpoint is null)
        {
            throw new NotFoundException($"Endpoint with ID '{id}' was not found.", "endpoint_not_found");
        }

        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == endpoint.MapVersionId, cancellationToken);
        var mapStatus = mapVersion?.Status;

        if (mapStatus is null)
        {
            throw new NotFoundException(
                $"MapVersion with ID '{endpoint.MapVersionId}' was not found.",
                "map_version_not_found");
        }

        if (mapStatus != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Endpoints can only be updated on DRAFT map versions (current status: {mapStatus}).",
                "map_version_not_draft");
        }

        endpoint.Name = request.Name.Trim();
        endpoint.EndpointType = Enum.Parse<EndpointType>(request.EndpointType, ignoreCase: true);
        endpoint.X = request.X;
        endpoint.Y = request.Y;
        endpoint.Yaw = request.Yaw;
        endpoint.PositionTolerance = request.PositionTolerance;
        endpoint.YawTolerance = request.YawTolerance;
        endpoint.IsEnabled = request.IsEnabled;
        endpoint.StorageLocationCode = EndpointStorage.Normalize(request.StorageLocationCode);

        if (endpoint.StorageLocationCode is { } storageCode)
        {
            await endpointStorage.EnsureCanMarkAsync(mapVersion!, endpoint, storageCode, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new UpdateEndpointResponse(
            endpoint.Id,
            endpoint.MapVersionId,
            endpoint.Code,
            endpoint.Name,
            endpoint.EndpointType.ToString(),
            endpoint.X,
            endpoint.Y,
            endpoint.Yaw,
            endpoint.PositionTolerance,
            endpoint.YawTolerance,
            endpoint.IsEnabled,
            endpoint.StorageLocationCode);
    }
}
