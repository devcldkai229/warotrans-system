namespace WaroTrans.Transportation.Entities;

/// <summary>
/// TRN-03: one request to stop (part of) a TransportRequest, followed until every robot and container is accounted for.
/// It records the intent and how far the cancellation got; it does not replace the request / Job statuses, which keep
/// their meaning and only change for work that is really stopped. At most one is active per request (partial unique
/// index), and <see cref="IdempotencyKey"/> makes a repeated call return the same operation.
/// </summary>
public sealed class TransportCancellation
{
    public Guid Id { get; set; }
    public Guid TransportRequestId { get; set; }

    /// <summary><see cref="CancellationScopes"/>: the whole request or some of its details.</summary>
    public string Scope { get; set; } = CancellationScopes.Request;

    /// <summary>The details chosen when <see cref="Scope"/> is DETAILS.</summary>
    public List<Guid>? TargetDetailIds { get; set; }

    /// <summary><see cref="CancellationStatuses"/>.</summary>
    public string Status { get; set; } = CancellationStatuses.Requested;

    public string ReasonCode { get; set; } = CancellationReasonCodes.OperatorRequested;
    public string? Reason { get; set; }
    public Guid? RequestedBy { get; set; }
    public DateTimeOffset RequestedAt { get; set; }
    public DateTimeOffset? FinalizedAt { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public string? LastError { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; }

    public ICollection<TransportCancellationItem> Items { get; set; } = [];

    public bool IsActive => Status != CancellationStatuses.Finalized;
}

/// <summary>One Job touched by a cancellation: its robot, where the cancel stands for it, and each of its containers.</summary>
public sealed class TransportCancellationItem
{
    public Guid Id { get; set; }
    public Guid CancellationId { get; set; }
    public Guid JobId { get; set; }
    public string JobNo { get; set; } = string.Empty;
    public Guid? RobotId { get; set; }
    public string? RobotCode { get; set; }

    /// <summary><see cref="CancellationStages"/>.</summary>
    public string Stage { get; set; } = CancellationStages.Pending;

    public List<CancellationContainer> Containers { get; set; } = [];
    public DateTimeOffset UpdatedAt { get; set; }

    public TransportCancellation Cancellation { get; set; } = null!;
}

/// <summary>A container of a cancelled Job and what became of it.</summary>
public sealed class CancellationContainer
{
    public Guid ContainerId { get; set; }

    /// <summary>The JobContainer status last seen.</summary>
    public string JobContainerStatus { get; set; } = string.Empty;

    /// <summary><see cref="ContainerResolutions"/>; null while it is still open (on the robot, not yet stopped).</summary>
    public string? Resolution { get; set; }

    /// <summary>Where a person put it when unloading it by hand.</summary>
    public Guid? StorageLocationId { get; set; }
    public short? LevelNo { get; set; }
    public string? ScannedBarcode { get; set; }
    public Guid? HandedOverBy { get; set; }
    public DateTimeOffset? HandedOverAt { get; set; }
}

public static class CancellationScopes
{
    public const string Request = "REQUEST";
    public const string Details = "DETAILS";
}

/// <summary>Where the cancellation as a whole stands. Not every one goes the happy way: WAITING_ROBOT and MANUAL_INTERVENTION hold it.</summary>
public static class CancellationStatuses
{
    public const string Requested = "REQUESTED";

    /// <summary>A robot was told to stop and has not confirmed it holds still yet.</summary>
    public const string Stopping = "STOPPING";

    /// <summary>A robot is offline or did not confirm its stop in time: it is not treated as stopped.</summary>
    public const string WaitingRobot = "WAITING_ROBOT";

    /// <summary>Robots hold still; their cargo is being delivered or unloaded by hand.</summary>
    public const string Recovering = "RECOVERING";

    /// <summary>Something a person must sort out (cargo cancelled without a handover, robot fault). Never closes by itself.</summary>
    public const string ManualIntervention = "MANUAL_INTERVENTION";

    /// <summary>No old work runs and every container is accounted for.</summary>
    public const string Finalized = "FINALIZED";
}

/// <summary>Where the cancellation stands for one Job.</summary>
public static class CancellationStages
{
    /// <summary>Not yet seen stopped or cancelled.</summary>
    public const string Pending = "PENDING";

    public const string StopRequested = "STOP_REQUESTED";
    public const string WaitingRobot = "WAITING_ROBOT";

    /// <summary>The robot holds still with cargo of this request: deliver it or unload it by hand.</summary>
    public const string CargoOnRobot = "CARGO_ON_ROBOT";

    /// <summary>Someone chose to deliver the cargo anyway: the Job runs again, only to drop off what is on board.</summary>
    public const string Delivering = "DELIVERING";

    public const string Manual = "MANUAL";
    public const string Done = "DONE";
}

public static class ContainerResolutions
{
    public const string Delivered = "DELIVERED";
    public const string Failed = "FAILED";

    /// <summary>Never picked up: cancelled, the warehouse is unchanged.</summary>
    public const string NotPickedUp = "NOT_PICKED_UP";

    /// <summary>Taken off the robot by a person who scanned it and said where it is.</summary>
    public const string HandedOver = "HANDED_OVER";

    /// <summary>Its Job was cancelled while it was on the robot, without a handover, and Warehouse still has it in transit.</summary>
    public const string Unrecovered = "UNRECOVERED";

    /// <summary>Same, but someone recovered it to a shelf afterwards.</summary>
    public const string RecoveredManually = "RECOVERED_MANUALLY";
}

public static class CancellationReasonCodes
{
    public const string OperatorRequested = "OPERATOR_REQUESTED";
    public const string CustomerCancelled = "CUSTOMER_CANCELLED";
    public const string WrongRequest = "WRONG_REQUEST";
    public const string StockProblem = "STOCK_PROBLEM";
    public const string RobotProblem = "ROBOT_PROBLEM";
    public const string Other = "OTHER";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        OperatorRequested, CustomerCancelled, WrongRequest, StockProblem, RobotProblem, Other
    };
}
