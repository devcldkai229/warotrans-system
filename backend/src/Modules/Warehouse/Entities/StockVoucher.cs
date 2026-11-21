using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Entities;

/// <summary>
/// Phiếu nhập/xuất. One line per Container, so the quantity is a Container count (rules/00).
/// DRAFT → CONFIRMED by people; CONFIRMED → COMPLETED when the last open line is done (see
/// <see cref="StockVoucherProgress"/>); people may also close a CONFIRMED voucher short. Stock follows each Container
/// when a robot delivers it, never a status change of the voucher.
/// </summary>
public sealed class StockVoucher
{
    public const int ClosedShortReasonMaxLength = 500;

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

    /// <summary>
    /// When the confirmation took effect on the Containers (inbound: admitted; outbound: reserved for issue). Not a
    /// stock movement: stock moves when robots deliver.
    /// </summary>
    public DateTimeOffset? StockPostedAt { get; set; }
    public Guid? CancelledBy { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    /// <summary>The last open line got done, or people closed the voucher short with at least one line done.</summary>
    public DateTimeOffset? CompletedAt { get; set; }
    public Guid? ClosedShortBy { get; set; }
    public DateTimeOffset? ClosedShortAt { get; set; }
    public string? ClosedShortReason { get; set; }
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
        return AddLines([container], now)[0];
    }

    public IReadOnlyList<StockVoucherLine> AddLines(IReadOnlyList<Container> containers, DateTimeOffset now)
    {
        EnsureDraft();
        var seen = Lines.Select(l => l.ContainerId).ToHashSet();
        var eligible = EligibleContainerStatuses(Type);
        foreach (var container in containers)
        {
            if (!eligible.Contains(container.Status))
                throw new DomainValidationException($"Container '{container.Barcode}' cannot go on a {Type} voucher (status: {container.Status}).", "voucher_container_not_eligible");
            if (!seen.Add(container.Id))
                throw new ConflictException($"Container '{container.Barcode}' is already on voucher {Code}.", "voucher_container_duplicate");
        }
        var number = Lines.Count == 0 ? 0 : Lines.Max(l => l.LineNo);
        var added = containers.Select(container => new StockVoucherLine
        {
            Id = Guid.NewGuid(), StockVoucherId = Id, LineNo = ++number,
            ContainerId = container.Id, ProductId = container.ProductId, CreatedAt = now
        }).ToList();
        foreach (var line in added) Lines.Add(line);
        UpdatedAt = now;
        return added;
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
        StockPostedAt = now;
        UpdatedAt = now;
    }

    /// <summary>
    /// Only a DRAFT can be cancelled outright: a CONFIRMED voucher may already have robots moving its Containers, so it
    /// is closed short instead (<see cref="CloseShort"/>).
    /// </summary>
    public void Cancel(Guid accountId, DateTimeOffset now)
    {
        EnsureDraft();

        Status = StockVoucherStatus.CANCELLED;
        CancelledBy = accountId;
        CancelledAt = now;
        UpdatedAt = now;
    }

    /// <summary>
    /// A CONFIRMED voucher whose open lines are all done becomes COMPLETED. <paramref name="isDone"/> tells, per line,
    /// whether its Container is done (<see cref="StockVoucherProgress.IsDone"/>).
    /// </summary>
    /// <returns>True when this call completed the voucher.</returns>
    public bool CompleteIfFinished(Func<StockVoucherLine, bool> isDone, DateTimeOffset now)
    {
        if (Status != StockVoucherStatus.CONFIRMED)
        {
            return false;
        }

        var open = Lines.Where(l => l.IsOpen).ToList();
        if (open.Count == 0 || !open.All(isDone))
        {
            return false;
        }

        Status = StockVoucherStatus.COMPLETED;
        CompletedAt = now;
        UpdatedAt = now;
        return true;
    }

    /// <summary>
    /// People stop waiting for the lines that are not done: those lines are closed (their Containers leave the
    /// voucher). With at least one line done the voucher is COMPLETED; with none it is CANCELLED, as if never confirmed.
    /// </summary>
    /// <returns>The lines that were closed.</returns>
    public IReadOnlyList<StockVoucherLine> CloseShort(Guid accountId, string reason, Func<StockVoucherLine, bool> isDone, DateTimeOffset now)
    {
        if (Status != StockVoucherStatus.CONFIRMED)
        {
            throw new ConflictException(
                $"Voucher {Code} is {Status}; only a CONFIRMED voucher can be closed short.",
                "voucher_not_confirmed");
        }

        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new DomainValidationException("Say why the voucher is closed short.", "voucher_close_reason_required");
        }

        var open = Lines.Where(l => l.IsOpen).ToList();
        var closing = open.Where(l => !isDone(l)).ToList();
        foreach (var line in closing)
        {
            line.ClosedShortAt = now;
        }

        ClosedShortBy = accountId;
        ClosedShortAt = now;
        ClosedShortReason = reason.Trim().Length > ClosedShortReasonMaxLength
            ? reason.Trim()[..ClosedShortReasonMaxLength]
            : reason.Trim();
        if (open.Count > closing.Count)
        {
            Status = StockVoucherStatus.COMPLETED;
            CompletedAt = now;
        }
        else
        {
            Status = StockVoucherStatus.CANCELLED;
            CancelledBy = accountId;
            CancelledAt = now;
            StockPostedAt = null;
        }

        UpdatedAt = now;
        return closing;
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

/// <summary>What "done" means for a voucher line: on a shelf for inbound, issued for outbound.</summary>
public static class StockVoucherProgress
{
    public static bool IsDone(StockVoucherType type, ContainerStatus status) =>
        type == StockVoucherType.INBOUND
            ? status is ContainerStatus.STORED or ContainerStatus.ISSUED
            : status == ContainerStatus.ISSUED;
}
