using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.UnitTests.Warehouse.Features.StockVouchers;

public sealed class StockVoucherDomainTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    private static StockVoucher Voucher(StockVoucherType type) =>
        StockVoucher.Create("PN-20261106-000001", type, Guid.NewGuid(), "  PO-77 ", " ", Guid.NewGuid(), Now);

    private static Container Container(ContainerStatus status, string barcode = "CTN-1") => new()
    {
        Id = Guid.NewGuid(),
        ProductId = Guid.NewGuid(),
        Barcode = barcode,
        Status = status
    };

    [Fact]
    public void Create_opens_a_draft_and_trims_text()
    {
        var voucher = Voucher(StockVoucherType.INBOUND);

        Assert.Equal(StockVoucherStatus.DRAFT, voucher.Status);
        Assert.Equal("PO-77", voucher.ReferenceNo);
        Assert.Null(voucher.Note);
        Assert.Empty(voucher.Lines);
    }

    [Theory]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.CREATED)]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.PACKED)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.STORED)]
    public void AddLine_accepts_eligible_containers_and_numbers_lines(StockVoucherType type, ContainerStatus status)
    {
        var voucher = Voucher(type);
        var first = Container(status, "CTN-1");
        var second = Container(status, "CTN-2");

        var line1 = voucher.AddLine(first, Now);
        var line2 = voucher.AddLine(second, Now);

        Assert.Equal(1, line1.LineNo);
        Assert.Equal(2, line2.LineNo);
        Assert.Equal(first.ProductId, line1.ProductId);
        Assert.Equal(2, voucher.Lines.Count);
    }

    [Theory]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.STORED)]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.ISSUED)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.CREATED)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.ISSUED)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.IN_TRANSIT)]
    public void AddLine_rejects_ineligible_containers(StockVoucherType type, ContainerStatus status)
    {
        var voucher = Voucher(type);

        var ex = Assert.Throws<DomainValidationException>(() => voucher.AddLine(Container(status), Now));

        Assert.Equal("voucher_container_not_eligible", ex.Code);
    }

    [Fact]
    public void AddLine_rejects_the_same_container_twice()
    {
        var voucher = Voucher(StockVoucherType.INBOUND);
        var container = Container(ContainerStatus.CREATED);
        voucher.AddLine(container, Now);

        var ex = Assert.Throws<ConflictException>(() => voucher.AddLine(container, Now));

        Assert.Equal("voucher_container_duplicate", ex.Code);
    }

    [Fact]
    public void Confirm_needs_at_least_one_container()
    {
        var voucher = Voucher(StockVoucherType.OUTBOUND);

        var ex = Assert.Throws<DomainValidationException>(() => voucher.Confirm(Guid.NewGuid(), Now));

        Assert.Equal("voucher_lines_required", ex.Code);
        Assert.Equal(StockVoucherStatus.DRAFT, voucher.Status);
    }

    [Fact]
    public void Confirmed_voucher_is_locked()
    {
        var voucher = Voucher(StockVoucherType.INBOUND);
        var line = voucher.AddLine(Container(ContainerStatus.CREATED), Now);
        var confirmer = Guid.NewGuid();

        voucher.Confirm(confirmer, Now);

        Assert.Equal(StockVoucherStatus.CONFIRMED, voucher.Status);
        Assert.Equal(confirmer, voucher.ConfirmedBy);
        Assert.Equal("voucher_not_draft", Assert.Throws<DomainValidationException>(() => voucher.AddLine(Container(ContainerStatus.CREATED, "CTN-9"), Now)).Code);
        Assert.Equal("voucher_not_draft", Assert.Throws<DomainValidationException>(() => voucher.RemoveLine(line.Id, Now)).Code);
        Assert.Equal("voucher_not_draft", Assert.Throws<DomainValidationException>(() => voucher.Cancel(Guid.NewGuid(), Now)).Code);
    }

    [Fact]
    public void Cancel_closes_a_draft()
    {
        var voucher = Voucher(StockVoucherType.OUTBOUND);
        var account = Guid.NewGuid();

        voucher.Cancel(account, Now);

        Assert.Equal(StockVoucherStatus.CANCELLED, voucher.Status);
        Assert.Equal(account, voucher.CancelledBy);
        Assert.Throws<DomainValidationException>(() => voucher.Confirm(account, Now));
    }

    [Fact]
    public void RemoveLine_takes_the_container_off_a_draft()
    {
        var voucher = Voucher(StockVoucherType.INBOUND);
        var line = voucher.AddLine(Container(ContainerStatus.CREATED), Now);

        voucher.RemoveLine(line.Id, Now);

        Assert.Empty(voucher.Lines);
        Assert.Equal("voucher_line_not_found", Assert.Throws<NotFoundException>(() => voucher.RemoveLine(line.Id, Now)).Code);
    }

    private static (StockVoucher Voucher, Dictionary<Guid, Container> Boxes) Confirmed(StockVoucherType type, int count)
    {
        var voucher = Voucher(type);
        var boxes = new Dictionary<Guid, Container>();
        for (var i = 0; i < count; i++)
        {
            var box = Container(type == StockVoucherType.INBOUND ? ContainerStatus.CREATED : ContainerStatus.STORED, $"CTN-{i}");
            boxes[box.Id] = box;
            voucher.AddLine(box, Now);
        }

        voucher.Confirm(Guid.NewGuid(), Now);
        return (voucher, boxes);
    }

    private static Func<StockVoucherLine, bool> DoneBy(StockVoucher voucher, Dictionary<Guid, Container> boxes) =>
        line => StockVoucherProgress.IsDone(voucher.Type, boxes[line.ContainerId].Status);

    [Fact]
    public void Confirm_records_when_it_took_effect()
    {
        var (voucher, _) = Confirmed(StockVoucherType.OUTBOUND, 1);

        Assert.Equal(StockVoucherStatus.CONFIRMED, voucher.Status);
        Assert.Equal(Now, voucher.StockPostedAt);
        Assert.Null(voucher.CompletedAt);
    }

    [Theory]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.STORED)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.ISSUED)]
    public void The_last_container_done_completes_the_voucher(StockVoucherType type, ContainerStatus done)
    {
        var (voucher, boxes) = Confirmed(type, 3);
        var all = boxes.Values.ToList();

        all[0].Status = done;
        all[1].Status = done;
        Assert.False(voucher.CompleteIfFinished(DoneBy(voucher, boxes), Now));
        Assert.Equal(StockVoucherStatus.CONFIRMED, voucher.Status);

        all[2].Status = done;
        Assert.True(voucher.CompleteIfFinished(DoneBy(voucher, boxes), Now));
        Assert.Equal(StockVoucherStatus.COMPLETED, voucher.Status);
        Assert.Equal(Now, voucher.CompletedAt);
        Assert.False(voucher.CompleteIfFinished(DoneBy(voucher, boxes), Now));
    }

    [Fact]
    public void A_container_on_a_robot_is_not_done()
    {
        var (voucher, boxes) = Confirmed(StockVoucherType.OUTBOUND, 1);
        boxes.Values.Single().Status = ContainerStatus.IN_TRANSIT;

        Assert.False(voucher.CompleteIfFinished(DoneBy(voucher, boxes), Now));
    }

    [Fact]
    public void A_draft_never_completes()
    {
        var voucher = Voucher(StockVoucherType.INBOUND);
        var box = Container(ContainerStatus.CREATED);
        voucher.AddLine(box, Now);
        box.Status = ContainerStatus.STORED;

        Assert.False(voucher.CompleteIfFinished(_ => true, Now));
        Assert.Equal(StockVoucherStatus.DRAFT, voucher.Status);
    }

    [Fact]
    public void Closing_short_with_lines_done_completes_and_drops_the_rest()
    {
        var (voucher, boxes) = Confirmed(StockVoucherType.INBOUND, 3);
        var all = boxes.Values.ToList();
        all[0].Status = ContainerStatus.STORED;
        all[1].Status = ContainerStatus.STORED;
        var account = Guid.NewGuid();

        var closed = voucher.CloseShort(account, "  Job cancelled, CTN-2 stays at the gate ", DoneBy(voucher, boxes), Now);

        var dropped = Assert.Single(closed);
        Assert.Equal(all[2].Id, dropped.ContainerId);
        Assert.Equal(Now, dropped.ClosedShortAt);
        Assert.Equal(StockVoucherStatus.COMPLETED, voucher.Status);
        Assert.Equal(Now, voucher.CompletedAt);
        Assert.Equal(account, voucher.ClosedShortBy);
        Assert.Equal("Job cancelled, CTN-2 stays at the gate", voucher.ClosedShortReason);
        Assert.Equal(2, voucher.Lines.Count(l => l.IsOpen));
    }

    [Fact]
    public void Closing_short_with_nothing_done_cancels()
    {
        var (voucher, boxes) = Confirmed(StockVoucherType.OUTBOUND, 2);

        var closed = voucher.CloseShort(Guid.NewGuid(), "Order withdrawn", DoneBy(voucher, boxes), Now);

        Assert.Equal(2, closed.Count);
        Assert.Equal(StockVoucherStatus.CANCELLED, voucher.Status);
        Assert.Null(voucher.StockPostedAt);
        Assert.Null(voucher.CompletedAt);
    }

    [Fact]
    public void Closing_short_needs_a_reason_and_a_confirmed_voucher()
    {
        var (voucher, boxes) = Confirmed(StockVoucherType.OUTBOUND, 1);
        Assert.Equal("voucher_close_reason_required",
            Assert.Throws<DomainValidationException>(() => voucher.CloseShort(Guid.NewGuid(), " ", DoneBy(voucher, boxes), Now)).Code);

        var draft = Voucher(StockVoucherType.OUTBOUND);
        Assert.Equal("voucher_not_confirmed",
            Assert.Throws<ConflictException>(() => draft.CloseShort(Guid.NewGuid(), "why", _ => false, Now)).Code);
    }

    [Theory]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.STORED, true)]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.ISSUED, true)]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.IN_TRANSIT, false)]
    [InlineData(StockVoucherType.INBOUND, ContainerStatus.CREATED, false)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.ISSUED, true)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.STORED, false)]
    [InlineData(StockVoucherType.OUTBOUND, ContainerStatus.HOLD, false)]
    public void What_done_means(StockVoucherType type, ContainerStatus status, bool done) =>
        Assert.Equal(done, StockVoucherProgress.IsDone(type, status));
}
