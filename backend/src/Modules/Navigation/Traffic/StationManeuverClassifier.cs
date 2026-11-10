using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// Classifies station in→out maneuvers: reverse-out / continuous arc / true in-place pivot.
/// Δheading &gt; 30° alone does not imply a spin — skid-steer may reverse or arc through free space.
/// </summary>
public static class StationManeuverClassifier
{
    public enum ManeuverClass
    {
        ReverseSameEdge,
        YawDriveInReverseOut,
        ContinuousArc,
        TruePivot
    }

    public sealed record PairResult(
        int InEdgeId,
        int OutEdgeId,
        double InHeadingRad,
        double OutHeadingRad,
        double DeltaDeg,
        ManeuverClass Class,
        string? CollisionDetail);

    public sealed record StationVerdict(
        string EndpointCode,
        int NodeId,
        double X,
        double Y,
        double YawRad,
        IReadOnlyList<PairResult> Pairs,
        bool NeedsPivotClearance,
        bool PivotClearanceOk,
        /// <summary>disk | pivot_rect | arc_hit | spin_disabled | reverse_disabled — when pivot/capability fails.</summary>
        string? FailReason = null);

    /// <summary>
    /// True when at least one non-reverse maneuver is a true pivot (arc / yaw-reverse failed).
    /// Those stations need TurnRadius (or pivot sweep) clearance.
    /// </summary>
    public static bool StationNeedsPivotClearance(
        int nodeId,
        IReadOnlyList<TrafficEdge> incident,
        Func<int, (double X, double Y)> poseOf,
        TrafficFootprintOptions footprint,
        OccupancyGrid? occupancy,
        double? endpointYawRad)
    {
        var verdict = Evaluate(
            endpointCode: "",
            nodeId,
            incident,
            poseOf,
            footprint,
            occupancy,
            endpointYawRad);
        return verdict.NeedsPivotClearance;
    }

    public static StationVerdict Evaluate(
        string endpointCode,
        int nodeId,
        IReadOnlyList<TrafficEdge> incident,
        IReadOnlyDictionary<int, RouteGraphNode> nodes,
        TrafficFootprintOptions footprint,
        OccupancyGrid? occupancy,
        double? endpointYawRad) =>
        Evaluate(endpointCode, nodeId, incident, id => (nodes[id].X, nodes[id].Y), footprint, occupancy, endpointYawRad);

    public static StationVerdict Evaluate(
        string endpointCode,
        int nodeId,
        IReadOnlyList<TrafficEdge> incident,
        Func<int, (double X, double Y)> poseOf,
        TrafficFootprintOptions footprint,
        OccupancyGrid? occupancy,
        double? endpointYawRad)
    {
        var (nx, ny) = poseOf(nodeId);
        var yaw = endpointYawRad ?? 0;
        var incoming = incident.Where(e => e.EndId == nodeId).ToList();
        var outgoing = incident.Where(e => e.StartId == nodeId).ToList();
        var pairs = new List<PairResult>();

        if (incoming.Count == 0 || outgoing.Count == 0)
        {
            // Dead-end bay: approach then reverse out — no spin clearance.
            return new StationVerdict(endpointCode, nodeId, nx, ny, yaw, pairs, false, true);
        }

        foreach (var inn in incoming)
        {
            var ia = poseOf(inn.StartId);
            var ib = poseOf(inn.EndId);
            var inAng = Math.Atan2(ib.Y - ia.Y, ib.X - ia.X);
            foreach (var oute in outgoing)
            {
                if (oute.EndId == inn.StartId)
                {
                    pairs.Add(new PairResult(
                        inn.Id, oute.Id, inAng, inAng + Math.PI, 180,
                        ManeuverClass.ReverseSameEdge, null));
                    continue;
                }

                var oa = poseOf(oute.StartId);
                var ob = poseOf(oute.EndId);
                var outAng = Math.Atan2(ob.Y - oa.Y, ob.X - oa.X);
                var delta = Math.Abs(Normalize(outAng - inAng));
                var deltaDeg = delta * 180 / Math.PI;

                if (IsYawDriveInReverseOut(inAng, outAng, yaw) || delta <= Math.PI / 6)
                {
                    pairs.Add(new PairResult(
                        inn.Id, oute.Id, inAng, outAng, deltaDeg,
                        ManeuverClass.YawDriveInReverseOut, null));
                    continue;
                }

                var arcHit = TryContinuousArc(
                    nx, ny, inAng, outAng, footprint, occupancy, out var arcDetail);
                if (arcHit)
                {
                    pairs.Add(new PairResult(
                        inn.Id, oute.Id, inAng, outAng, deltaDeg,
                        ManeuverClass.ContinuousArc, null));
                    continue;
                }

                pairs.Add(new PairResult(
                    inn.Id, oute.Id, inAng, outAng, deltaDeg,
                    ManeuverClass.TruePivot, arcDetail));
            }
        }

        var needsPivot = pairs.Any(p => p.Class == ManeuverClass.TruePivot);
        var pivotOk = true;
        string? failReason = null;
        if (needsPivot && occupancy is not null)
        {
            // Fail-closed lower bound: isotropic disk, then rectangular spin sweep.
            var clr = occupancy.ClearanceAt(nx, ny);
            if (clr + 1e-9 < footprint.TurnRadius)
            {
                pivotOk = false;
                failReason = $"disk clr={clr:0.###} required={footprint.TurnRadius:0.###}";
            }
            else if (!PivotSpinRectClear(nx, ny, footprint, occupancy, out var pivotDetail))
            {
                pivotOk = false;
                failReason = $"pivot_rect {pivotDetail}";
            }
        }

        return new StationVerdict(endpointCode, nodeId, nx, ny, yaw, pairs, needsPivot, pivotOk, failReason);
    }

    /// <summary>
    /// Drive-in aligned with endpoint yaw, reverse-out opposite; or leave is reverse of approach (±30°).
    /// </summary>
    public static bool IsYawDriveInReverseOut(double approachRad, double leaveRad, double yawRad)
    {
        const double tol = Math.PI / 6;
        var leaveIsReverseOfApproach = Math.Abs(Normalize(leaveRad - (approachRad + Math.PI))) <= tol;
        if (leaveIsReverseOfApproach)
        {
            return true;
        }

        var approachAligned = Math.Abs(Normalize(approachRad - yawRad)) <= tol;
        var leaveAlignedReverse = Math.Abs(Normalize(leaveRad - (yawRad + Math.PI))) <= tol;
        return approachAligned && leaveAlignedReverse;
    }

    /// <summary>
    /// Arc of radius = TurnRadius turning from approach to leave about an offset center.
    /// Every sample pose must keep the padded rectangle in free space.
    /// </summary>
    public static bool TryContinuousArc(
        double x,
        double y,
        double inAng,
        double outAng,
        TrafficFootprintOptions footprint,
        OccupancyGrid? occupancy,
        out string? failDetail)
    {
        failDetail = null;
        if (occupancy is null)
        {
            failDetail = "no_occupancy";
            return false;
        }

        var turn = Normalize(outAng - inAng);
        if (Math.Abs(turn) < 1e-6)
        {
            return true;
        }

        var r = Math.Max(footprint.TurnRadius, footprint.LengthMeters / 2.0);
        // Arc center: left of approach when turning left (positive turn CCW).
        var side = turn >= 0 ? 1.0 : -1.0;
        var cx = x - side * r * Math.Sin(inAng);
        var cy = y + side * r * Math.Cos(inAng);

        var startAng = Math.Atan2(y - cy, x - cx);
        var steps = Math.Max(8, (int)Math.Ceiling(Math.Abs(turn) / (Math.PI / 18)));
        for (var i = 0; i <= steps; i++)
        {
            var t = (double)i / steps;
            var a = startAng + side * Math.Abs(turn) * t;
            var px = cx + r * Math.Cos(a);
            var py = cy + r * Math.Sin(a);
            // Heading tangent to arc.
            var heading = a + side * Math.PI / 2;
            if (!RectClear(px, py, heading, footprint, occupancy, out var hit))
            {
                failDetail = $"arc_hit t={t:0.##} pose=({px:0.###},{py:0.###},{heading:0.###}) {hit}";
                return false;
            }
        }

        return true;
    }

    public static bool PivotSpinRectClear(
        double x,
        double y,
        TrafficFootprintOptions footprint,
        OccupancyGrid occupancy,
        out string? failDetail)
    {
        failDetail = null;
        const int steps = 24;
        for (var i = 0; i < steps; i++)
        {
            var yaw = 2 * Math.PI * i / steps;
            if (!RectClear(x, y, yaw, footprint, occupancy, out var hit))
            {
                failDetail = $"pivot_hit yaw={yaw:0.###} {hit}";
                return false;
            }
        }

        return true;
    }

    /// <summary>Padded rectangle free: perimeter + corners have ClearanceAt &gt; 0.</summary>
    public static bool RectClear(
        double x,
        double y,
        double yaw,
        TrafficFootprintOptions footprint,
        OccupancyGrid occupancy,
        out string? hit)
    {
        hit = null;
        var halfL = footprint.LengthMeters / 2.0 + footprint.PaddingMeters;
        var halfW = footprint.WidthMeters / 2.0 + footprint.PaddingMeters;
        var c = Math.Cos(yaw);
        var s = Math.Sin(yaw);

        // Local corners: (±halfL, ±halfW)
        Span<(double lx, double ly)> local = stackalloc (double, double)[4];
        local[0] = (halfL, halfW);
        local[1] = (halfL, -halfW);
        local[2] = (-halfL, -halfW);
        local[3] = (-halfL, halfW);

        for (var i = 0; i < 4; i++)
        {
            var (lx, ly) = local[i];
            var wx = x + lx * c - ly * s;
            var wy = y + lx * s + ly * c;
            if (occupancy.ClearanceAt(wx, wy) <= 1e-9)
            {
                hit = $"corner({wx:0.###},{wy:0.###})";
                return false;
            }

            // Edge samples toward next corner.
            var (nx, ny) = local[(i + 1) % 4];
            for (var k = 1; k <= 3; k++)
            {
                var u = k / 4.0;
                var ex = lx + (nx - lx) * u;
                var ey = ly + (ny - ly) * u;
                var wx2 = x + ex * c - ey * s;
                var wy2 = y + ex * s + ey * c;
                if (occupancy.ClearanceAt(wx2, wy2) <= 1e-9)
                {
                    hit = $"edge({wx2:0.###},{wy2:0.###})";
                    return false;
                }
            }
        }

        return true;
    }

    public static double Normalize(double a)
    {
        while (a > Math.PI)
        {
            a -= 2 * Math.PI;
        }

        while (a < -Math.PI)
        {
            a += 2 * Math.PI;
        }

        return a;
    }
}
