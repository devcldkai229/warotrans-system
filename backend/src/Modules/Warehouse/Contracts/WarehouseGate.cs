namespace WaroTrans.Warehouse.Contracts;

/// <summary>Receiving and shipping gates are WAYPOINTs with an INBOUND or OUTBOUND token in their map code.</summary>
public static class WarehouseGate
{
    public static bool IsInbound(string code, string type) => HasRole(code, type, "INBOUND");
    public static bool IsOutbound(string code, string type) => HasRole(code, type, "OUTBOUND");

    private static bool HasRole(string code, string type, string role) =>
        type == "WAYPOINT" && code.Split(['-', '_', ' '], StringSplitOptions.RemoveEmptyEntries)
            .Contains(role, StringComparer.OrdinalIgnoreCase);
}
