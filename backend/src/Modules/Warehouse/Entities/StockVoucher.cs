using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Entities;

/// <summary>
/// Phiếu nhập/xuất. One line per Container, so the quantity is a Container count (rules/00). Its status is a
/// document status set by people (DRAFT → CONFIRMED | CANCELLED); robot progress is read from the Containers.
/// </summary>
public sealed class StockVoucher
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public StockVoucherType Type { get; set; }
    public StockVoucherStatus Status { get; set; }
    public Guid WarehouseId { get; set; }
    public string? ReferenceNo { get; set; }
    public string? Note { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    public Guid? CancelledBy { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<StockVoucherLine> Lines { get; set; } = [];

    /// <summary>Statuses a Container may have to go on a voucher of this type.</summary>
    public static ContainerStatus[] EligibleContainerStatuses(StockVoucherType type) =>
        type == StockVoucherType.INBOUND
            ? [ContainerStatus.CREATED, ContainerStatus.PACKED]
            : [ContainerStatus.STORED];

    public static StockVoucher Create(
        string code,
        StockVoucherType type,
        Guid warehouseId,
        string? referenceNo,
        string? note,
        Guid createdBy,
        DateTimeOffset now) =>
        new()
        {
            Id = Guid.NewGuid(),
            Code = code,
            Type = type,
            Status = StockVoucherStatus.DRAFT,
            WarehouseId = warehouseId,
            ReferenceNo = string.IsNullOrWhiteSpace(referenceNo) ? null : referenceNo.Trim(),
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            CreatedBy = createdBy,
            CreatedAt = now,
            UpdatedAt = now
        };

    public StockVoucherLine AddLine(Container container, DateTimeOffset now)
    {
        EnsureDraft();

        if (!EligibleContainerStatuses(Type).Contains(container.Status))
        {
            throw new DomainValidationException(
                $"Container '{container.Barcode}' cannot go on a {Type} voucher (status: {container.Status}).",
                "voucher_container_not_eligible");
        }

        if (Lines.Any(l => l.ContainerId == container.Id))
        {
            throw new ConflictException(
                $"Container '{container.Barcode}' is already on voucher {Code}.",
                "voucher_container_duplicate");
        }

        var line = new StockVoucherLine
        {
            Id = Guid.NewGuid(),
            StockVoucherId = Id,
            LineNo = Lines.Count == 0 ? 1 : Lines.Max(l => l.LineNo) + 1,
            ContainerId = container.Id,
            ProductId = container.ProductId,
            CreatedAt = now
        };
        Lines.Add(line);
        UpdatedAt = now;
        return line;
    }

    public void RemoveLine(Guid lineId, DateTimeOffset now)
    {
        EnsureDraft();

        var line = Lines.FirstOrDefault(l => l.Id == lineId)
            ?? throw new NotFoundException($"Line '{lineId}' is not on voucher {Code}.", "voucher_line_not_found");
        Lines.Remove(line);
        UpdatedAt = now;
    }

    public void Confirm(Guid accountId, DateTimeOffset now)
    {
        EnsureDraft();

        if (Lines.Count == 0)
        {
            throw new DomainValidationException(
                $"Voucher {Code} has no Containers to confirm.",
                "voucher_lines_required");
        }

        Status = StockVoucherStatus.CONFIRMED;
        ConfirmedBy = accountId;
        ConfirmedAt = now;
        UpdatedAt = now;
    }

    /// <summary>
    /// Only a DRAFT can be cancelled: a CONFIRMED voucher may already have robots moving its Containers.
    /// </summary>
    public void Cancel(Guid accountId, DateTimeOffset now)
    {
        EnsureDraft();

        Status = StockVoucherStatus.CANCELLED;
        CancelledBy = accountId;
        CancelledAt = now;
        UpdatedAt = now;
    }

    private void EnsureDraft()
    {
        if (Status != StockVoucherStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Voucher {Code} is {Status}; only a DRAFT voucher can be changed.",
                "voucher_not_draft");
        }
    }
}
