namespace WaroTrans.Transportation.Entities;

public enum ScheduleRecurrence
{
    ONCE,
    DAILY,
    WEEKLY
}

public enum TransportScheduleStatus
{
    ACTIVE,
    PAUSED,
    CANCELLED,

    /// <summary>No occurrence left (ONCE after its wave, or past <see cref="TransportSchedule.EndsAt"/>).</summary>
    FINISHED
}

public enum TransportWaveStatus
{
    PLANNED,

    /// <summary>Has a Transport Request, queued for someone to start.</summary>
    STARTED,

    /// <summary>Nothing matched the rule at that time.</summary>
    SKIPPED,

    /// <summary>The Host was down or the schedule paused when it was due. Not run late.</summary>
    MISSED,
    CANCELLED,

    /// <summary>The request could not be created; see <see cref="TransportWave.Note"/>. Not retried.</summary>
    FAILED
}

/// <summary>
/// WH-09: a rule that repeats. Containers are physical, so a schedule stores which ones qualify (a product on a shelf), not
/// a list: each wave picks the STORED ones that match when it is due. Warehouse and Navigation ids are scalars.
/// </summary>
public sealed class TransportSchedule
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid WarehouseId { get; set; }
    public Guid MapVersionId { get; set; }
    public Guid WorkflowId { get; set; }
    public Guid ProductId { get; set; }
    public Guid SourceStorageLocationId { get; set; }
    public Guid SourceEndpointId { get; set; }
    public Guid DestinationEndpointId { get; set; }
    public Guid? DestinationStorageLocationId { get; set; }
    public short? DestinationLevelNo { get; set; }
    public int MaxContainersPerWave { get; set; }
    public ScheduleRecurrence Recurrence { get; set; }

    /// <summary>Wall clock of <see cref="Timezone"/>.</summary>
    public TimeOnly LocalTime { get; set; }
    public DateOnly StartDate { get; set; }

    /// <summary>WEEKLY only: days it runs, as a bit per <see cref="DayOfWeek"/> (Sunday = bit 0).</summary>
    public int DaysOfWeekMask { get; set; }
    public string Timezone { get; set; } = string.Empty;
    public DateTimeOffset? EndsAt { get; set; }
    public TransportScheduleStatus Status { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<TransportWave> Waves { get; set; } = [];
}

public sealed class TransportWave
{
    public Guid Id { get; set; }
    public Guid TransportScheduleId { get; set; }
    public DateTimeOffset PlannedAt { get; set; }
    public TransportWaveStatus Status { get; set; }
    public Guid? TransportRequestId { get; set; }
    public int ContainerCount { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }

    public TransportSchedule TransportSchedule { get; set; } = null!;
}
