namespace WaroTrans.Fleet.Enums;

/// <summary>
/// FL-08 auto return-to-park. NAVIGATING and YIELDING are live: at most one per robot and per parking Endpoint.
/// </summary>
public enum PositioningIntentStatus
{
    /// <summary>NAVIGATE to the parking Endpoint sent (or about to be).</summary>
    NAVIGATING,

    /// <summary>A Job took the robot: CANCEL sent, waiting for the robot to stop and traffic to be reconciled.</summary>
    YIELDING,

    /// <summary>The robot reached the parking Endpoint.</summary>
    ARRIVED,

    /// <summary>Handed to the Job: the NAVIGATE ended and traffic was reconciled from the robot's own pose.</summary>
    YIELDED,

    /// <summary>NAVIGATE refused, failed, timed out or aborted (robot offline).</summary>
    FAILED
}

public enum PositioningIntentKind
{
    RETURN_TO_PARK
}
