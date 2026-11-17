using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Status;

/// <summary>What a run has to have for its evidence to count as complete.</summary>
/// <param name="VideoRequired">A run with no usable video is PARTIAL (both robots have cameras).</param>
/// <param name="FinalizeGrace">How long after a run ends uploads may still arrive before missing evidence is declared.</param>
public sealed record EvidencePolicy(bool VideoRequired, TimeSpan FinalizeGrace)
{
    public static readonly EvidencePolicy Default = new(true, TimeSpan.FromMinutes(15));
}

/// <param name="EndedAtUtc">Null while the robot still holds the trip.</param>
public sealed record RunFacts(DateTimeOffset? EndedAtUtc, IReadOnlyList<RecordingStatus> Recordings, bool HasTrajectory);

/// <summary>
/// Evidence completeness from the data itself (spec §5.3). Never derived from the delivery result: a delivered trip
/// with no video is PARTIAL evidence, a failed trip fully recorded is FINALIZED evidence.
/// </summary>
public static class EvidenceStatusCalculator
{
    /// <summary>Transport request states after which no new trip starts (as Transportation names them).</summary>
    private static readonly HashSet<string> RequestClosed = new(StringComparer.Ordinal)
    {
        "COMPLETED", "FAILED", "CANCELLED", "REJECTED"
    };

    public static EvidenceRunStatus Run(RunFacts run, DateTimeOffset now, EvidencePolicy policy)
    {
        var inFlight = run.Recordings.Any(r => r is RecordingStatus.PENDING or RecordingStatus.RECORDING
            or RecordingStatus.FINALIZING or RecordingStatus.UPLOADING);
        if (run.EndedAtUtc is not { } ended)
        {
            return inFlight || run.HasTrajectory || run.Recordings.Count > 0 ? EvidenceRunStatus.RECORDING : EvidenceRunStatus.PENDING;
        }

        var graceOver = now - ended >= policy.FinalizeGrace;
        if (inFlight)
        {
            return EvidenceRunStatus.FINALIZING;
        }

        if (run.Recordings.Count == 0)
        {
            if (!policy.VideoRequired)
            {
                return EvidenceRunStatus.FINALIZED;
            }

            if (!graceOver)
            {
                return EvidenceRunStatus.FINALIZING;
            }

            return run.HasTrajectory ? EvidenceRunStatus.PARTIAL : EvidenceRunStatus.CAPTURE_FAILED;
        }

        if (run.Recordings.All(r => r == RecordingStatus.READY))
        {
            return EvidenceRunStatus.FINALIZED;
        }

        if (run.Recordings.All(r => r == RecordingStatus.FAILED) && !run.HasTrajectory)
        {
            return EvidenceRunStatus.CAPTURE_FAILED;
        }

        return EvidenceRunStatus.PARTIAL;
    }

    /// <param name="transportStatus">The request's status verbatim; only used to know whether more trips may start.</param>
    public static EvidenceJournalStatus Journal(IReadOnlyList<EvidenceRunStatus> runs, string? transportStatus)
    {
        if (runs.Count == 0 || runs.Any(r => r is EvidenceRunStatus.PENDING or EvidenceRunStatus.RECORDING))
        {
            return EvidenceJournalStatus.OPEN;
        }

        // Every known run ended, but the request may still start another trip.
        if (transportStatus is null || !RequestClosed.Contains(transportStatus))
        {
            return EvidenceJournalStatus.OPEN;
        }

        if (runs.Any(r => r == EvidenceRunStatus.FINALIZING))
        {
            return EvidenceJournalStatus.FINALIZING;
        }

        return runs.Any(r => r is EvidenceRunStatus.PARTIAL or EvidenceRunStatus.CAPTURE_FAILED)
            ? EvidenceJournalStatus.PARTIAL
            : EvidenceJournalStatus.FINALIZED;
    }
}
