namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Whether this host acts on robot uplink. A standby host (traffic coordinator lease held elsewhere) must not: it would
/// handle every RESULT a second time and mark robots offline from its own view. Active unless a lease service closes it.
/// </summary>
public sealed class RobotIngressGate
{
    private volatile bool _active = true;

    public bool IsActive => _active;

    public void SetActive(bool active) => _active = active;
}
