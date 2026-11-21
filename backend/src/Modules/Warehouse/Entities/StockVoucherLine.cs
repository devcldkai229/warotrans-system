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

    /// <summary>
    /// Set when the voucher was closed short while this line was not done: the Container left the voucher and is free
    /// for another one. Null on every line that is still open or got done.
    /// </summary>
    public DateTimeOffset? ClosedShortAt { get; set; }

    public bool IsOpen => ClosedShortAt is null;

    public StockVoucher StockVoucher { get; set; } = null!;
    public Container? Container { get; set; }
    public Product? Product { get; set; }
}
