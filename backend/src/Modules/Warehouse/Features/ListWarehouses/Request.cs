namespace WaroTrans.Warehouse.Features.ListWarehouses;

public sealed record ListWarehousesRequest(bool? IsActive, int Skip, int Take);
