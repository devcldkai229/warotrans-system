namespace WaroTrans.Warehouse.Entities;

/// <summary>One Container on a StockVoucher. ProductId is copied from the Container to group lines by product.</summary>
public sealed class StockVoucherLine
{
    public Guid Id { get; set; }
    public Guid StockVoucherId { get; set; }
    public int LineNo { get; set; }
    public Guid ContainerId { get; set; }
    public Guid ProductId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public StockVoucher StockVoucher { get; set; } = null!;
    public Container? Container { get; set; }
    public Product? Product { get; set; }
}
