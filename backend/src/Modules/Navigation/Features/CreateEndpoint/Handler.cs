using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.CreateEndpoint;

public sealed class CreateEndpointHandler(
    NavigationDbContext dbContext,
    IBusinessCodeGenerator codeGenerator,
    IValidator<CreateEndpointRequest> validator)
{
    public async Task<EndpointResponse> HandleAsync(
        Guid mapVersionId,
        CreateEndpointRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mapVersionId, cancellationToken);

        if (mapVersion is null)
        {
            throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");
        }

        if (mapVersion.Status != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Endpoints can only be added to DRAFT map versions (current status: {mapVersion.Status}).",
                "map_version_not_draft");
        }

        var name = request.Name.Trim();
        var code = await codeGenerator.NextEndpointCodeAsync(name, cancellationToken);

        var codeExists = await dbContext.Endpoints
            .AsNoTracking()
            .AnyAsync(e => e.MapVersionId == mapVersionId && e.Code == code, cancellationToken);

        if (codeExists)
        {
            throw new ConflictException(
                $"Endpoint code '{code}' already exists on this map version.",
                "endpoint_code_conflict");
        }

        var endpoint = new Endpoint
        {
            Id = Guid.NewGuid(),
            MapVersionId = mapVersionId,
            Code = code,
            Name = name,
            EndpointType = Enum.Parse<EndpointType>(request.EndpointType, ignoreCase: true),
            X = request.X,
            Y = request.Y,
            Yaw = request.Yaw,
            PositionTolerance = request.PositionTolerance,
            YawTolerance = request.YawTolerance,
            IsEnabled = request.IsEnabled ?? true
        };

        dbContext.Endpoints.Add(endpoint);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // A concurrent create with the same name passed the existence check first; the unique index rejects this one.
            throw new ConflictException(
                $"Endpoint code '{code}' already exists on this map version.",
                "endpoint_code_conflict");
        }

        return new EndpointResponse(
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
            endpoint.IsEnabled);
    }
}
