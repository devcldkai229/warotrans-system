using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

public sealed class Robot
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid CurrentMapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public RobotStatus Status { get; set; }
    public decimal BatteryPercent { get; set; }

    /// <summary>
    /// HW-04: when the robot last reported a battery value. Null = never measured (a robot without a battery sensor
    /// reports null), so <see cref="BatteryPercent"/> is meaningless and must be shown as Unknown, never as 0 %.
    /// </summary>
    public DateTimeOffset? BatteryMeasuredAt { get; set; }

    /// <summary>HW-04: how the last value was obtained, as the robot reported it (shown next to the percentage).</summary>
    public double? BatteryVoltage { get; set; }
    public string? BatteryEstimationMode { get; set; }
    public string? BatteryConfidence { get; set; }

    /// <summary>Keeps the robot's own description of its battery estimate; unknown fields stay null.</summary>
    public void ApplyBatteryMetadata(double? voltage, string? mode, string? confidence)
    {
        BatteryVoltage = voltage;
        BatteryEstimationMode = Clip(mode);
        BatteryConfidence = Clip(confidence);

        static string? Clip(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value.Length > 30 ? value[..30] : value;
    }
    public double PoseX { get; set; }
    public double PoseY { get; set; }
    public double PoseYaw { get; set; }
    public DateTimeOffset? LastHeartbeatAt { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsOnline { get; set; }
    public DateTimeOffset? LastTelemetryAt { get; set; }
    public NavigationStatus? NavigationStatus { get; set; }
    public LocalizationStatus? LocalizationStatus { get; set; }
    public double? LinearVelocity { get; set; }
    public double? AngularVelocity { get; set; }
    public string? ErrorCode { get; set; }
    public string? MapVersionCode { get; set; }
    public Guid? CurrentCommandId { get; set; }
    public Guid? LastHeartbeatBootId { get; set; }
    public long? LastHeartbeatSequence { get; set; }
    /// <summary>
    /// The robot holds every motion (STOP/PAUSE accepted, not resumed yet). Reported by the robot in telemetry
    /// (<c>motionHold</c>); a held robot is never dispatched, navigated or driven (RB-03).
    /// </summary>
    public bool MotionHeld { get; set; }
    public DateTimeOffset? MotionHoldChangedAt { get; set; }

    /// <summary>Exclusive manual-drive lease (RB-04): one holder at a time, renewed while the joystick is used.</summary>
    public Guid? ManualLeaseHolderId { get; set; }
    public string? ManualLeaseHolderName { get; set; }
    public DateTimeOffset? ManualLeaseUntil { get; set; }

    /// <summary>Why the robot is in MAINTENANCE, and since when (RB-08).</summary>
    public string? MaintenanceReason { get; set; }
    public DateTimeOffset? MaintenanceSince { get; set; }

    /// <summary>System actions the robot announced in its heartbeat (RESTART_STACK, REBOOT, SHUTDOWN), comma separated.</summary>
    public string? Capabilities { get; set; }

    public bool HasActiveManualLease(DateTimeOffset now) => ManualLeaseHolderId is not null && ManualLeaseUntil > now;

    public bool Supports(string capability) =>
        Capabilities is { } list && list.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Contains(capability, StringComparer.Ordinal);

    /// <summary>FL-03: what this robot may carry and its size. Null means nobody declared it, not "no limit".</summary>
    public decimal? MaxPayloadKg { get; set; }
    public int? MaxContainers { get; set; }
    public double? LengthM { get; set; }
    public double? WidthM { get; set; }

    public Guid? LastTelemetryBootId { get; set; }
    public long? LastTelemetrySequence { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static Robot Register(
        Guid warehouseId,
        Guid currentMapVersionId,
        string code,
        string name,
        DateTimeOffset utcNow)
    {
        return new Robot
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            CurrentMapVersionId = currentMapVersionId,
            Code = code,
            Name = name,
            Status = RobotStatus.OFFLINE,
            BatteryPercent = 0,
            PoseX = 0,
            PoseY = 0,
            PoseYaw = 0,
            IsEnabled = true,
            IsOnline = false,
            CreatedAt = utcNow,
            UpdatedAt = utcNow
        };
    }

    public void Enable()
    {
        if (IsEnabled)
        {
            throw new DomainValidationException(
                "Robot is already enabled.",
                "robot_already_enabled");
        }

        IsEnabled = true;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void Disable()
    {
        if (!IsEnabled)
        {
            throw new DomainValidationException(
                "Robot is already disabled.",
                "robot_already_disabled");
        }

        IsEnabled = false;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Applies heartbeat. Does not change operational <see cref="Status"/>.
    /// Returns false when the message is stale/duplicate.
    /// </summary>
    public bool TryApplyHeartbeat(Guid bootId, long sequence, DateTimeOffset sentAt, DateTimeOffset utcNow, out bool becameOnline)
    {
        becameOnline = false;

        if (LastHeartbeatBootId == bootId
            && LastHeartbeatSequence is { } lastSeq
            && sequence <= lastSeq)
        {
            return false;
        }

        LastHeartbeatBootId = bootId;
        LastHeartbeatSequence = sequence;
        // Connectivity liveness uses Host receive time, not robot sentAt (WSL/Windows skew
        // and sim-clock HB gaps must not false-offline a robot that is still publishing).
        _ = sentAt;
        LastHeartbeatAt = utcNow;

        if (!IsOnline)
        {
            IsOnline = true;
            becameOnline = true;
        }

        UpdatedAt = utcNow;
        return true;
    }

    /// <summary>
    /// Applies telemetry snapshot. Never changes operational <see cref="Status"/> or <see cref="IsOnline"/>.
    /// Returns false when the message is stale/duplicate.
    /// </summary>
    public bool TryApplyTelemetry(
        Guid bootId,
        long sequence,
        DateTimeOffset sentAt,
        DateTimeOffset utcNow,
        double? poseX,
        double? poseY,
        double? poseYaw,
        decimal? batteryPercent,
        NavigationStatus navigationStatus,
        LocalizationStatus localizationStatus,
        double linearVelocity,
        double angularVelocity,
        string? mapVersionCode,
        Guid? currentCommandId,
        string? errorCode)
    {
        if (LastTelemetryBootId == bootId
            && LastTelemetrySequence is { } lastSeq
            && sequence <= lastSeq)
        {
            return false;
        }

        LastTelemetryBootId = bootId;
        LastTelemetrySequence = sequence;
        // Same receive-time liveness as heartbeat (WSL/Windows clock skew).
        _ = sentAt;
        LastTelemetryAt = utcNow;

        // Only accept a pose when localized and provided — never treat missing pose as 0,0,0.
        if (localizationStatus == Enums.LocalizationStatus.LOCALIZED
            && poseX is not null
            && poseY is not null
            && poseYaw is not null)
        {
            PoseX = poseX.Value;
            PoseY = poseY.Value;
            PoseYaw = poseYaw.Value;
        }

        if (batteryPercent is not null)
        {
            BatteryPercent = batteryPercent.Value;
            BatteryMeasuredAt = utcNow;
        }

        NavigationStatus = navigationStatus;
        LocalizationStatus = localizationStatus;
        LinearVelocity = linearVelocity;
        AngularVelocity = angularVelocity;
        MapVersionCode = mapVersionCode;
        CurrentCommandId = currentCommandId;
        ErrorCode = errorCode;
        UpdatedAt = utcNow;
        return true;
    }

    /// <summary>
    /// Marks connectivity offline. Does not change operational <see cref="Status"/>.
    /// </summary>
    public bool MarkOffline(DateTimeOffset utcNow)
    {
        if (!IsOnline)
        {
            return false;
        }

        IsOnline = false;
        UpdatedAt = utcNow;
        return true;
    }

    /// <summary>Backend-owned: reserve robot for an issued navigate command.</summary>
    public void ReserveForCommand(Guid commandId, DateTimeOffset utcNow)
    {
        Status = RobotStatus.RESERVED;
        CurrentCommandId = commandId;
        UpdatedAt = utcNow;
    }

    /// <summary>Backend-owned: robot accepted navigate and Nav2 is running.</summary>
    public void MarkExecuting(Guid commandId, DateTimeOffset utcNow)
    {
        Status = RobotStatus.EXECUTING;
        CurrentCommandId = commandId;
        UpdatedAt = utcNow;
    }

    /// <summary>
    /// Operator puts a registered robot into service: OFFLINE (never commissioned) → AVAILABLE.
    /// Heartbeats deliberately never change <see cref="Status"/>, so without this a newly registered robot could not
    /// be dispatched at all. Only a connected, enabled robot that is not running a command may be put in service.
    /// </summary>
    public void PutInService(DateTimeOffset utcNow)
    {
        if (Status != RobotStatus.OFFLINE)
        {
            throw new ConflictException($"Robot {Code} is already {Status}.", "robot_not_offline");
        }

        if (!IsEnabled)
        {
            throw new DomainValidationException($"Robot {Code} is disabled.", "robot_disabled");
        }

        if (!IsOnline)
        {
            throw new DomainValidationException($"Robot {Code} is not connected (no heartbeat).", "robot_offline");
        }

        if (CurrentCommandId is not null)
        {
            throw new ConflictException($"Robot {Code} still has command {CurrentCommandId}.", "robot_busy");
        }

        Status = RobotStatus.AVAILABLE;
        UpdatedAt = utcNow;
    }

    /// <summary>
    /// Admin: the robot now runs on another published map version. Only while it has no command; its pose and
    /// localization belong to the old map, so it must localize again (reported by its next telemetry).
    /// </summary>
    public void ChangeMap(Guid mapVersionId, DateTimeOffset utcNow)
    {
        if (CurrentCommandId is not null)
        {
            throw new ConflictException($"Robot {Code} still has command {CurrentCommandId}.", "robot_busy");
        }

        CurrentMapVersionId = mapVersionId;
        LocalizationStatus = Enums.LocalizationStatus.UNKNOWN;
        UpdatedAt = utcNow;
    }

    /// <summary>Backend-owned: clear command and return to AVAILABLE.</summary>
    public void MarkAvailable(DateTimeOffset utcNow)
    {
        // A command finishing does not end a maintenance session: only an authorized Technician does (RB-08).
        if (Status != RobotStatus.MAINTENANCE)
        {
            Status = RobotStatus.AVAILABLE;
        }

        CurrentCommandId = null;
        UpdatedAt = utcNow;
    }

    public void ClearCurrentCommand(DateTimeOffset utcNow)
    {
        CurrentCommandId = null;
        UpdatedAt = utcNow;
    }
}
