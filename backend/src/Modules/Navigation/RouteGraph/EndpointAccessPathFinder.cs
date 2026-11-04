namespace WaroTrans.Navigation.RouteGraph;

/// <summary>
/// Compile-time local footprint-aware BFS from a lane foot to an Endpoint pose.
/// Does not invent lane↔lane shortcuts — path only connects foot ↔ station for authorized IsConnector edges.
/// </summary>
public static class EndpointAccessPathFinder
{
    private static readonly (int Dc, int Dr)[] Neighbours =
    [
        (1, 0), (-1, 0), (0, 1), (0, -1),
        (1, 1), (1, -1), (-1, 1), (-1, -1)
    ];

    /// <summary>
    /// Returns a polyline foot → … → goal (inclusive) when a clearance-safe path exists within
    /// <paramref name="maxDistance"/>, or null.
    /// </summary>
    public static IReadOnlyList<(double X, double Y)>? Find(
        double footX,
        double footY,
        double goalX,
        double goalY,
        double maxDistance,
        double requiredHalfWidth,
        double stepMeters,
        Func<double, double, double> clearanceAt,
        Func<double, double, bool> isKeepOut,
        Func<double, double, bool>? isAllowed = null)
    {
        if (stepMeters <= 1e-6 || maxDistance <= 0 || !double.IsFinite(maxDistance))
        {
            return null;
        }

        var straight = Math.Sqrt(Square(goalX - footX) + Square(goalY - footY));
        if (straight > maxDistance + 1e-9)
        {
            return null;
        }

        bool Blocked(double x, double y) =>
            isKeepOut(x, y) || (isAllowed is not null && !isAllowed(x, y));

        // Fast path: straight chord.
        if (ChordClear(footX, footY, goalX, goalY, stepMeters, requiredHalfWidth, clearanceAt, Blocked))
        {
            return [(footX, footY), (goalX, goalY)];
        }

        var minX = Math.Min(footX, goalX) - maxDistance;
        var maxX = Math.Max(footX, goalX) + maxDistance;
        var minY = Math.Min(footY, goalY) - maxDistance;
        var maxY = Math.Max(footY, goalY) + maxDistance;
        var cols = Math.Max(1, (int)Math.Ceiling((maxX - minX) / stepMeters) + 1);
        var rows = Math.Max(1, (int)Math.Ceiling((maxY - minY) / stepMeters) + 1);
        if (cols * rows > 80_000)
        {
            return null; // refuse pathological search windows
        }

        int ToCol(double x) => (int)Math.Round((x - minX) / stepMeters);
        int ToRow(double y) => (int)Math.Round((y - minY) / stepMeters);
        double ToX(int c) => minX + c * stepMeters;
        double ToY(int r) => minY + r * stepMeters;

        bool Free(int c, int r)
        {
            if (c < 0 || r < 0 || c >= cols || r >= rows)
            {
                return false;
            }

            var (x, y) = (ToX(c), ToY(r));
            if (Blocked(x, y))
            {
                return false;
            }

            return clearanceAt(x, y) + 1e-9 >= requiredHalfWidth;
        }

        var startC = Math.Clamp(ToCol(footX), 0, cols - 1);
        var startR = Math.Clamp(ToRow(footY), 0, rows - 1);
        var goalC = Math.Clamp(ToCol(goalX), 0, cols - 1);
        var goalR = Math.Clamp(ToRow(goalY), 0, rows - 1);

        // Allow start/goal even if slightly under clearance (pose is authoring truth); neighbours must be free.
        if (!Free(startC, startR) && clearanceAt(footX, footY) + 1e-9 < requiredHalfWidth * 0.5)
        {
            return null;
        }

        var came = new Dictionary<(int C, int R), (int C, int R)>();
        var queue = new Queue<(int C, int R)>();
        var seen = new HashSet<(int C, int R)> { (startC, startR) };
        queue.Enqueue((startC, startR));

        var found = false;
        while (queue.Count > 0)
        {
            var cur = queue.Dequeue();
            if (cur.C == goalC && cur.R == goalR)
            {
                found = true;
                break;
            }

            var cx = ToX(cur.C);
            var cy = ToY(cur.R);
            foreach (var (dc, dr) in Neighbours)
            {
                var n = (C: cur.C + dc, R: cur.R + dr);
                if (!seen.Add(n))
                {
                    continue;
                }

                if (n.C == goalC && n.R == goalR)
                {
                    // Accept goal cell even if under-clearance — station pose is fixed.
                    came[n] = cur;
                    queue.Enqueue(n);
                    continue;
                }

                if (!Free(n.C, n.R))
                {
                    continue;
                }

                var nx = ToX(n.C);
                var ny = ToY(n.R);
                // Diagonal step must not cut a blocked corner.
                if (dc != 0 && dr != 0 && (!Free(cur.C + dc, cur.R) || !Free(cur.C, cur.R + dr)))
                {
                    continue;
                }

                if (Math.Sqrt(Square(nx - footX) + Square(ny - footY)) > maxDistance + stepMeters)
                {
                    continue;
                }

                // Edge between cells must keep clearance.
                if (!ChordClear(cx, cy, nx, ny, stepMeters, requiredHalfWidth, clearanceAt, Blocked))
                {
                    continue;
                }

                came[n] = cur;
                queue.Enqueue(n);
            }
        }

        if (!found && !came.ContainsKey((goalC, goalR)))
        {
            return null;
        }

        var pathCells = new List<(int C, int R)>();
        var walk = (C: goalC, R: goalR);
        pathCells.Add(walk);
        while (walk.C != startC || walk.R != startR)
        {
            if (!came.TryGetValue(walk, out var prev))
            {
                return null;
            }

            walk = prev;
            pathCells.Add(walk);
        }

        pathCells.Reverse();
        var world = new List<(double X, double Y)> { (footX, footY) };
        foreach (var (c, r) in pathCells.Skip(1))
        {
            if (c == goalC && r == goalR)
            {
                break;
            }

            world.Add((ToX(c), ToY(r)));
        }

        world.Add((goalX, goalY));
        return Simplify(world, stepMeters * 1.5);
    }

    private static List<(double X, double Y)> Simplify(IReadOnlyList<(double X, double Y)> path, double minSeg)
    {
        if (path.Count <= 2)
        {
            return [.. path];
        }

        // Drop near-duplicate samples first.
        var spaced = new List<(double X, double Y)> { path[0] };
        for (var i = 1; i < path.Count - 1; i++)
        {
            var prev = spaced[^1];
            var cur = path[i];
            if (Math.Sqrt(Square(cur.X - prev.X) + Square(cur.Y - prev.Y)) >= minSeg)
            {
                spaced.Add(cur);
            }
        }

        spaced.Add(path[^1]);

        // Collapse collinear runs (dense BFS stairs → fewer false heading kinks).
        if (spaced.Count <= 2)
        {
            return spaced;
        }

        var result = new List<(double X, double Y)> { spaced[0] };
        for (var i = 1; i < spaced.Count - 1; i++)
        {
            var a = result[^1];
            var b = spaced[i];
            var c = spaced[i + 1];
            var abx = b.X - a.X;
            var aby = b.Y - a.Y;
            var bcx = c.X - b.X;
            var bcy = c.Y - b.Y;
            var abLen = Math.Sqrt(Square(abx) + Square(aby));
            var bcLen = Math.Sqrt(Square(bcx) + Square(bcy));
            if (abLen < 1e-9 || bcLen < 1e-9)
            {
                continue;
            }

            var cross = Math.Abs(abx * bcy - aby * bcx) / (abLen * bcLen);
            // ~sin(angle); keep vertex when turn exceeds ~8°.
            if (cross > 0.14)
            {
                result.Add(b);
            }
        }

        result.Add(spaced[^1]);
        return result;
    }

    private static bool ChordClear(
        double x0, double y0, double x1, double y1,
        double step,
        double requiredHalfWidth,
        Func<double, double, double> clearanceAt,
        Func<double, double, bool> isKeepOut)
    {
        var dx = x1 - x0;
        var dy = y1 - y0;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length < 1e-9)
        {
            return clearanceAt(x0, y0) + 1e-9 >= requiredHalfWidth && !isKeepOut(x0, y0);
        }

        var samples = Math.Max(1, (int)Math.Ceiling(length / Math.Max(step, 0.02)));
        for (var i = 0; i <= samples; i++)
        {
            var t = (double)i / samples;
            var x = x0 + dx * t;
            var y = y0 + dy * t;
            if (isKeepOut(x, y) || clearanceAt(x, y) + 1e-9 < requiredHalfWidth)
            {
                return false;
            }
        }

        return true;
    }

    private static double Square(double v) => v * v;
}
