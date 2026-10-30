namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// Spatial index of directed segment swept corridors (capsule of radius = turnRadius).
/// Two segments conflict when their buffers intersect (and they do not share a vertex as a simple adjacency).
/// </summary>
public sealed class SweptConflictIndex
{
    private readonly Dictionary<int, List<int>> _conflicts;
    private readonly double _cellSize;

    private SweptConflictIndex(Dictionary<int, List<int>> conflicts, double cellSize)
    {
        _conflicts = conflicts;
        _cellSize = cellSize;
    }

    public double CellSize => _cellSize;

    public IReadOnlyList<int> ConflictsWith(int edgeId) =>
        _conflicts.TryGetValue(edgeId, out var list) ? list : [];

    public bool Conflicts(int a, int b)
    {
        if (a == b) return false;
        return _conflicts.TryGetValue(a, out var list) && list.BinarySearch(b) >= 0;
    }

    public static SweptConflictIndex Build(
        IReadOnlyList<(int Id, double X0, double Y0, double X1, double Y1)> segments,
        double turnRadius)
    {
        var radius = Math.Max(turnRadius, 1e-6);
        var cellSize = Math.Max(radius * 2, 0.5);
        var grid = new Dictionary<(int, int), List<int>>();

        foreach (var seg in segments)
        {
            foreach (var cell in CoverCells(seg.X0, seg.Y0, seg.X1, seg.Y1, radius, cellSize))
            {
                if (!grid.TryGetValue(cell, out var bucket))
                {
                    bucket = [];
                    grid[cell] = bucket;
                }

                bucket.Add(seg.Id);
            }
        }

        var byId = segments.ToDictionary(s => s.Id);
        var conflicts = new Dictionary<int, List<int>>();

        foreach (var seg in segments)
        {
            var candidates = new HashSet<int>();
            foreach (var cell in CoverCells(seg.X0, seg.Y0, seg.X1, seg.Y1, radius, cellSize))
            {
                if (grid.TryGetValue(cell, out var bucket))
                {
                    foreach (var otherId in bucket)
                    {
                        if (otherId != seg.Id)
                        {
                            candidates.Add(otherId);
                        }
                    }
                }
            }

            var list = new List<int>();
            foreach (var otherId in candidates.OrderBy(id => id))
            {
                var other = byId[otherId];
                if (ShareVertex(seg, other))
                {
                    continue;
                }

                if (SegmentBuffersIntersect(
                        seg.X0, seg.Y0, seg.X1, seg.Y1,
                        other.X0, other.Y0, other.X1, other.Y1,
                        radius))
                {
                    list.Add(otherId);
                }
            }

            conflicts[seg.Id] = list;
        }

        // Conflict is undirected. Spatial hashing + ShareVertex skips can leave A→B without B→A;
        // symmetrize so ValidateOverlapSymmetry / mutual exclusion stay consistent (V019 OVERLAP_ASYMMETRIC).
        foreach (var (id, list) in conflicts.ToArray())
        {
            foreach (var otherId in list)
            {
                if (!conflicts.TryGetValue(otherId, out var otherList))
                {
                    otherList = [];
                    conflicts[otherId] = otherList;
                }

                var idx = otherList.BinarySearch(id);
                if (idx < 0)
                {
                    otherList.Insert(~idx, id);
                }
            }
        }

        return new SweptConflictIndex(conflicts, cellSize);
    }

    private static bool ShareVertex(
        (int Id, double X0, double Y0, double X1, double Y1) a,
        (int Id, double X0, double Y0, double X1, double Y1) b)
    {
        const double eps = 1e-6;
        return Near(a.X0, a.Y0, b.X0, b.Y0, eps) || Near(a.X0, a.Y0, b.X1, b.Y1, eps) ||
               Near(a.X1, a.Y1, b.X0, b.Y0, eps) || Near(a.X1, a.Y1, b.X1, b.Y1, eps);
    }

    private static bool Near(double x0, double y0, double x1, double y1, double eps) =>
        Math.Abs(x0 - x1) <= eps && Math.Abs(y0 - y1) <= eps;

    /// <summary>Two capsules of equal radius intersect iff segment-segment distance ≤ 2r.</summary>
    public static bool SegmentBuffersIntersect(
        double ax0, double ay0, double ax1, double ay1,
        double bx0, double by0, double bx1, double by1,
        double radius)
    {
        var d = SegmentSegmentDistance(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1);
        return d <= 2 * radius + 1e-9;
    }

    public static double SegmentSegmentDistance(
        double ax0, double ay0, double ax1, double ay1,
        double bx0, double by0, double bx1, double by1)
    {
        // Clamp projection approach for two finite segments.
        var (ux, uy) = (ax1 - ax0, ay1 - ay0);
        var (vx, vy) = (bx1 - bx0, by1 - by0);
        var (wx, wy) = (ax0 - bx0, ay0 - by0);
        var a = ux * ux + uy * uy;
        var b = ux * vx + uy * vy;
        var c = vx * vx + vy * vy;
        var d = ux * wx + uy * wy;
        var e = vx * wx + vy * wy;
        const double eps = 1e-12;
        double sc, sN, sD = a;
        double tc, tN, tD = c;

        var denom = a * c - b * b;
        if (denom < eps)
        {
            sN = 0;
            sD = 1;
            tN = e;
            tD = c;
        }
        else
        {
            sN = b * e - c * d;
            tN = a * e - b * d;
            if (sN < 0)
            {
                sN = 0;
                tN = e;
                tD = c;
            }
            else if (sN > sD)
            {
                sN = sD;
                tN = e + b;
                tD = c;
            }
        }

        if (tN < 0)
        {
            tN = 0;
            if (-d < 0) sN = 0;
            else if (-d > a) sN = sD;
            else
            {
                sN = -d;
                sD = a;
            }
        }
        else if (tN > tD)
        {
            tN = tD;
            if (-d + b < 0) sN = 0;
            else if (-d + b > a) sN = sD;
            else
            {
                sN = -d + b;
                sD = a;
            }
        }

        sc = Math.Abs(sN) < eps ? 0 : sN / sD;
        tc = Math.Abs(tN) < eps ? 0 : tN / tD;
        var dx = wx + sc * ux - tc * vx;
        var dy = wy + sc * uy - tc * vy;
        return Math.Sqrt(dx * dx + dy * dy);
    }

    private static IEnumerable<(int, int)> CoverCells(
        double x0, double y0, double x1, double y1, double radius, double cellSize)
    {
        var minX = Math.Min(x0, x1) - radius;
        var maxX = Math.Max(x0, x1) + radius;
        var minY = Math.Min(y0, y1) - radius;
        var maxY = Math.Max(y0, y1) + radius;
        var c0 = (int)Math.Floor(minX / cellSize);
        var c1 = (int)Math.Floor(maxX / cellSize);
        var r0 = (int)Math.Floor(minY / cellSize);
        var r1 = (int)Math.Floor(maxY / cellSize);
        for (var r = r0; r <= r1; r++)
        {
            for (var c = c0; c <= c1; c++)
            {
                yield return (c, r);
            }
        }
    }
}
