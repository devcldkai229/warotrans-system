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
        LastHeartbeatAt = sentAt == default ? utcNow : sentAt;

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
        LastTelemetryAt = sentAt == default ? utcNow : sentAt;

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

    /// <summary>Backend-owned: clear command and return to AVAILABLE.</summary>
    public void MarkAvailable(DateTimeOffset utcNow)
    {
        Status = RobotStatus.AVAILABLE;
        CurrentCommandId = null;
        UpdatedAt = utcNow;
    }

    public void ClearCurrentCommand(DateTimeOffset utcNow)
    {
        CurrentCommandId = null;
        UpdatedAt = utcNow;
    }
}
