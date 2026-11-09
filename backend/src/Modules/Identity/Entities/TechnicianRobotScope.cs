namespace WaroTrans.Identity.Entities;

/// <summary>
/// One robot a Technician may diagnose, stop, drive and maintain. A Technician with no rows can act on no robot
/// (deny by default). <see cref="RobotId"/> is the Fleet robot id; Identity keeps no reference to Fleet tables.
/// </summary>
public sealed class TechnicianRobotScope
{
    public Guid AccountId { get; set; }
    public Guid RobotId { get; set; }
    public DateTimeOffset AssignedAt { get; set; }
    public Guid? AssignedBy { get; set; }
}
