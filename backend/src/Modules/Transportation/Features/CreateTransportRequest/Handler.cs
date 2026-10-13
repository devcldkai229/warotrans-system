using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.CreateTransportRequest;

public sealed class CreateTransportRequestHandler(
    TransportationDbContext dbContext,
    IWarehouseModule warehouseModule,
    INavigationModule navigationModule,
    IWorkflowRequestValidator workflowRequestValidator,
    IBusinessCodeGenerator businessCodeGenerator,
    ICurrentUser currentUser,
    IValidator<CreateTransportRequestRequest> validator,
    ILogger<CreateTransportRequestHandler> logger)
{
    private static readonly ContainerStatus[] EligibleContainerStatuses =
    [
        ContainerStatus.CREATED,
        ContainerStatus.PACKED,
        ContainerStatus.STORED
    ];

    private static readonly TransportRequestDetailStatus[] ActiveDetailStatuses =
    [
        TransportRequestDetailStatus.PENDING,
        TransportRequestDetailStatus.QUEUED,
        TransportRequestDetailStatus.IN_PROGRESS
    ];

    public async Task<CreateTransportRequestResponse> HandleAsync(
        CreateTransportRequestRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var requestedBy = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

        var details = request.Details!;

        await EnsureWarehouseAsync(request.WarehouseId, cancellationToken);
        await EnsureMapVersionAsync(request.WarehouseId, request.MapVersionId, cancellationToken);
        await EnsureEndpointsAsync(request.MapVersionId, details, cancellationToken);
        await EnsureContainersAsync(details, cancellationToken);

        var requestCode = await businessCodeGenerator.NextRequestCodeAsync(cancellationToken: cancellationToken);

        var transportRequest = TransportRequest.Submit(
            requestCode,
            request.WarehouseId,
            request.MapVersionId,
            request.WorkflowId,
            requestedBy,
            request.WorkflowInputs,
            request.Note,
            details.Select(d => new TransportRequestDetailDraft(
                d.SequenceNo,
                d.ContainerId,
                d.SourceStorageLocationId,
                d.SourceEndpointId,
                d.SourceLevelNo,
                d.DestinationStorageLocationId,
                d.DestinationEndpointId,
                d.DestinationLevelNo)).ToList(),
            DateTimeOffset.UtcNow);

        await workflowRequestValidator.ValidateAsync(
            transportRequest.WorkflowId,
            TransportRequestSnapshotMapper.ToExecutionSnapshot(transportRequest),
            cancellationToken);

        // Request + all Details are written by one SaveChanges, i.e. one transaction.
        dbContext.TransportRequests.Add(transportRequest);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException(
                "The TransportRequest conflicts with an existing record.",
                "transport_request_conflict");
        }

        logger.LogInformation(
            "TransportRequest {TransportRequestId} ({RequestCode}) submitted with {DetailCount} details by {AccountId}",
            transportRequest.Id,
            transportRequest.RequestCode,
            transportRequest.Details.Count,
            requestedBy);

        return ToResponse(transportRequest);
    }

    private async Task EnsureWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken)
    {
        var warehouse = await warehouseModule.GetWarehouseAsync(warehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{warehouseId}' was not found.", "warehouse_not_found");

        if (!warehouse.IsActive)
        {
            throw new DomainValidationException($"Warehouse '{warehouse.Code}' is inactive.", "warehouse_inactive");
        }
    }

    private async Task EnsureMapVersionAsync(Guid warehouseId, Guid mapVersionId, CancellationToken cancellationToken)
    {
        var mapVersion = await navigationModule.GetMapVersionAsync(mapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion '{mapVersionId}' was not found.", "map_version_not_found");

        if (mapVersion.WarehouseId != warehouseId)
        {
            throw new DomainValidationException(
                $"MapVersion '{mapVersionId}' does not belong to Warehouse '{warehouseId}'.",
                "map_version_warehouse_mismatch");
        }

        if (mapVersion.Status != MapStatus.PUBLISHED)
        {
            throw new DomainValidationException(
                $"MapVersion '{mapVersionId}' must be PUBLISHED (current: {mapVersion.Status}).",
                "map_version_not_published");
        }
    }

    private async Task EnsureEndpointsAsync(
        Guid mapVersionId,
        IReadOnlyList<CreateTransportRequestDetailRequest> details,
        CancellationToken cancellationToken)
    {
        var endpointIds = details
            .SelectMany(d => new[] { d.SourceEndpointId, d.DestinationEndpointId })
            .Distinct()
            .ToList();

        var endpoints = (await navigationModule.GetEndpointsAsync(endpointIds, cancellationToken))
            .ToDictionary(e => e.Id);

        foreach (var endpointId in endpointIds)
        {
            if (!endpoints.TryGetValue(endpointId, out var endpoint))
            {
                throw new NotFoundException($"Endpoint '{endpointId}' was not found.", "endpoint_not_found");
            }

            if (endpoint.MapVersionId != mapVersionId)
            {
                throw new DomainValidationException(
                    $"Endpoint '{endpoint.Code}' does not belong to MapVersion '{mapVersionId}'.",
                    "endpoint_not_on_map_version");
            }

            if (!endpoint.IsEnabled)
            {
                throw new DomainValidationException(
                    $"Endpoint '{endpoint.Code}' is disabled.",
                    "endpoint_disabled");
            }
        }
    }

    private async Task EnsureContainersAsync(
        IReadOnlyList<CreateTransportRequestDetailRequest> details,
        CancellationToken cancellationToken)
    {
        var containerIds = details.Select(d => d.ContainerId).ToList();

        var containers = (await warehouseModule.GetContainersAsync(containerIds, cancellationToken))
            .ToDictionary(c => c.Id);

        foreach (var containerId in containerIds)
        {
            if (!containers.TryGetValue(containerId, out var container))
            {
                throw new NotFoundException($"Container '{containerId}' was not found.", "container_not_found");
            }

            if (!EligibleContainerStatuses.Contains(container.Status))
            {
                throw new DomainValidationException(
                    $"Container '{container.Barcode}' is not eligible for transport (status: {container.Status}).",
                    "container_not_eligible");
            }
        }

        var alreadyRequested = await dbContext.TransportRequestDetails
            .AsNoTracking()
            .Where(d => containerIds.Contains(d.ContainerId) && ActiveDetailStatuses.Contains(d.Status))
            .Select(d => d.ContainerId)
            .FirstOrDefaultAsync(cancellationToken);

        if (alreadyRequested != Guid.Empty)
        {
            throw new ConflictException(
                $"Container '{containers[alreadyRequested].Barcode}' is already part of an active TransportRequest.",
                "container_already_requested");
        }
    }

    private static CreateTransportRequestResponse ToResponse(TransportRequest request) =>
        new(
            request.Id,
            request.RequestCode,
            request.Status.ToString(),
            request.WarehouseId,
            request.MapVersionId,
            request.WorkflowId,
            request.PlanSchemaVersion,
            request.RequestedBy,
            request.Note,
            request.WorkflowInputs ?? [],
            request.SubmittedAt,
            request.Details
                .OrderBy(d => d.SequenceNo)
                .Select(d => new TransportRequestDetailResponse(
                    d.Id,
                    d.SequenceNo,
                    d.ContainerId,
                    d.SourceStorageLocationId,
                    d.SourceEndpointId,
                    d.SourceLevelNo,
                    d.DestinationStorageLocationId,
                    d.DestinationEndpointId,
                    d.DestinationLevelNo,
                    d.Status.ToString()))
                .ToList());
}
