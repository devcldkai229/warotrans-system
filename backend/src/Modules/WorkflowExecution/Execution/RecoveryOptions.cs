namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>WFX-04. Section "Recovery".</summary>
public sealed class RecoveryOptions
{
    public const string SectionName = "Recovery";

    /// <summary>How long a robot may be silent before its Job leaves RUNNING. Short drops of the network stay below this.</summary>
    public int OfflineGraceSeconds { get; set; } = 120;

    /// <summary>
    /// A trip that lost its robot (offline, or its step asked for another robot) with nothing on board goes back to the
    /// queue by itself, so the next free robot takes it. With cargo on board it always waits for a person (recovery).
    /// </summary>
    public bool AutoRequeueWithoutCargo { get; set; } = true;

    public bool EnableTransferButton { get; set; }

    /// <summary>
    /// Payload recovery design: a second robot is sent only after a technician assessed the failed robot and confirmed it
    /// stands secured (SOURCE_SECURED). Off = the earlier flow (send a robot straight away), for older setups.
    /// </summary>
    public bool RequireSourceSecured { get; set; } = true;

    /// <summary>How many times a recovery MOVE may be sent again before the case asks for a person (INTERVENTION_REQUIRED).</summary>
    public int MaxRecoveryMoveAttempts { get; set; } = 3;
}
