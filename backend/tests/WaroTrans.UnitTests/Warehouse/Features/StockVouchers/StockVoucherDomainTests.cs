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
}
