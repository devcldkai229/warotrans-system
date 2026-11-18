using FluentValidation;
using WaroTrans.Transportation.Features.CreateTransportRequest;

namespace WaroTrans.Transportation.Features.PreviewOutboundPick;

public sealed record OutboundPickRequest(Guid WarehouseId, Guid MapVersionId, Guid ProductId, int ContainerCount, Guid DestinationEndpointId);

public sealed class OutboundPickValidator : AbstractValidator<OutboundPickRequest>
{
    public const int MaxContainers = 200;

    public OutboundPickValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.MapVersionId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.ContainerCount).InclusiveBetween(1, MaxContainers);
        RuleFor(x => x.DestinationEndpointId).NotEmpty();
    }
}

public sealed record OutboundPickResponse(int RequestedCount, bool IsComplete, IReadOnlyList<OutboundPickItem> Items);

public sealed record OutboundPickItem(
    string Barcode,
    string SourceStorageLocationCode,
    DateTimeOffset AdmittedAt,
    CreateTransportRequestDetailRequest Detail);
