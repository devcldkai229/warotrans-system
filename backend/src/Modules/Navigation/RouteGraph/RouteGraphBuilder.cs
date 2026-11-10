using System.Globalization;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.RouteGraph;

/// <summary>
/// Builds the Nav2 Route Server graph of a map version from its drawn Edges (lane centre lines), Endpoints and Zones.
/// Pure: no database, same input → same graph (stable ids and ordering).
/// <list type="number">
/// <item>Inactive Edges / Zones and disabled Endpoints are skipped.</item>
/// <item>Polyline points closer than <see cref="RouteGraphOptions.VertexSnapTolerance"/> share one node.</item>
/// <item>A node lying on the middle of another segment splits it (T-junction without a shared point).</item>
/// <item>Every polyline step is a straight directed segment: ONE_WAY → 1, BIDIRECTIONAL → 2 opposite segments.</item>
/// <item>Segments are split where they cross a zone boundary; a piece is "in" a zone when its midpoint is strictly
/// inside the polygon (a lane running along the boundary is outside). KEEP_OUT pieces are removed.</item>
/// <item><see cref="ZoneType.JUNCTION"/> is the only connectivity zone: every lane end that arrives at the polygon is
/// linked to every lane end that leaves it (arrival → departure only, so one-way lanes keep their direction). Prefer a
/// straight in-zone chord; with occupancy, replace unsafe chords by a clearance-safe polyline inside the polygon
/// (no centre node, no through-obstacle chords). SINGLE_OCCUPANCY / NO_STOP / SPEED never invent links.</item>
/// <item>An Endpoint becomes a station node at its stored (x, y). On-lane (within
/// <see cref="RouteGraphOptions.VertexSnapTolerance"/>): split the lane at that pose. Strictly inside JUNCTION:
/// portal → station access (IsConnector+IsJunction). Otherwise: straight IsConnector spur from the nearest lane foot
/// to the pose if length ≤ <see cref="RouteGraphOptions.MaxEndpointAccessDistance"/> and the chord avoids KEEP_OUT
/// (occupancy clearance is enforced at traffic compile). VertexSnap / EndpointSnapDistance are not reachability caps.
/// Perpendicular access never adds a reverse segment along a ONE_WAY lane.</item>
/// <item>SPEED lowers speed limits; NO_STOP / SINGLE_OCCUPANCY only label pieces; JUNCTION connectivity is via links.</item>
/// <item>Identical segments are merged (lowest speed limit, all Edge / Zone codes).</item>
/// <item>Every Endpoint must reach every other one; non-Endpoint nodes without an outgoing segment are reported.</item>
/// </list>
/// </summary>
public static class RouteGraphBuilder
{
    public const string GraphEmpty = "GRAPH_EMPTY";
    public const string EndpointTooFar = "ENDPOINT_TOO_FAR";
    public const string EndpointUnreachable = "ENDPOINT_UNREACHABLE";
    public const string EndpointInKeepOut = "ENDPOINT_IN_KEEP_OUT";
    public const string DeadEndNode = "DEAD_END_NODE";
    public const string LaneInKeepOut = "LANE_IN_KEEP_OUT";
    public const string ServiceAccessBlocked = "SERVICE_ACCESS_BLOCKED";
    public const string JunctionTransitionBlocked = "JUNCTION_TRANSITION_BLOCKED";

    public static RouteGraphResult Build(
        RouteGraphInput input,
        RouteGraphOptions? options = null,
        IEnumerable<IRouteGraphZoneRule>? zoneRules = null,
        RouteGraphAccessContext? access = null)
    {
        options ??= RouteGraphOptions.Default;
        var work = new Work(options, access);
        var issues = new List<RouteGraphIssue>();
        var zones = (input.Zones ?? [])
            .Where(z => z.IsActive && z.Ring.Count >= 3)
            .OrderBy(z => z.Code, StringComparer.Ordinal)
            .ToList();

        foreach (var edge in input.Edges.Where(e => e.IsActive).OrderBy(e => e.Code, StringComparer.Ordinal))
        {
            work.AddPolyline(edge);
        }

        work.SplitAtJunctions();
        foreach (var zone in zones)
        {
            work.SplitAtBoundary(zone.Ring);
        }

        foreach (var zone in zones.Where(z => z.ZoneType == ZoneType.KEEP_OUT))
        {
            var cut = work.RemoveInside(zone.Ring);
            if (cut.Count > 0)
            {
                issues.Add(new RouteGraphIssue(
                    LaneInKeepOut,
                    RouteGraphIssueSeverity.Warning,
                    $"KEEP_OUT zone {zone.Code} cuts lane(s) {string.Join(", ", cut)}: the part inside the zone is not drivable.",
                    [zone.Code, .. cut]));
            }
        }

        var keepOutRings = zones.Where(z => z.ZoneType == ZoneType.KEEP_OUT).Select(z => z.Ring).ToList();
        work.SetKeepOut(keepOutRings);
        foreach (var zone in zones.Where(z => z.ZoneType == ZoneType.JUNCTION))
        {
            work.ConnectJunction(zone.Code, zone.Ring, keepOutRings);
        }

        // Abutting / overlapping JUNCTION polygons share transitions (Lane → Junction → Junction → Lane).
        work.ConnectAdjacentJunctions();

        var endpoints = input.Endpoints.Where(e => e.IsEnabled).OrderBy(e => e.Code, StringComparer.Ordinal).ToList();
        foreach (var endpoint in endpoints)
        {
            var keepOut = zones.FirstOrDefault(z => z.ZoneType == ZoneType.KEEP_OUT && Inside(z.Ring, endpoint.X, endpoint.Y, options.VertexSnapTolerance));
            if (keepOut is not null)
            {
                issues.Add(new RouteGraphIssue(
                    EndpointInKeepOut,
                    RouteGraphIssueSeverity.Error,
                    $"Endpoint {endpoint.Code} is inside KEEP_OUT zone {keepOut.Code}: move the Endpoint or the zone.",
                    [endpoint.Code, keepOut.Code]));
            }
        }

        if (work.Segments.Count == 0)
        {
            issues.Add(new RouteGraphIssue(
                GraphEmpty,
                RouteGraphIssueSeverity.Error,
                "The map has no drivable Edge: draw the lanes the robot may drive on.",
                []));
        }
        else
        {
            foreach (var endpoint in endpoints)
            {
                work.AttachEndpoint(endpoint, issues);
            }
        }

        foreach (var zone in zones.Where(z => z.ZoneType != ZoneType.KEEP_OUT))
        {
            work.Label(zone);
        }

        var graph = work.Freeze(input.Name, input.FrameId);
        Validate(graph, issues);

        foreach (var rule in zoneRules ?? [])
        {
            graph = rule.Apply(graph, issues);
        }

        return new RouteGraphResult(graph, issues);
    }

    /// <summary>Only <see cref="ZoneType.JUNCTION"/> auto-links lane portals (lane↔lane). Off-lane access also uses foot spurs.</summary>
    public static bool IsJunctionZone(ZoneType type) => type is ZoneType.JUNCTION;

    private static void Validate(RouteGraph graph, List<RouteGraphIssue> issues)
    {
        var outgoing = graph.Nodes.ToDictionary(n => n.Id, _ => new List<int>());
        foreach (var edge in graph.Edges)
        {
            outgoing[edge.StartId].Add(edge.EndId);
        }

        var sab = issues
            .Where(i => i.Code == ServiceAccessBlocked)
            .SelectMany(i => i.RelatedCodes)
            .ToHashSet(StringComparer.Ordinal);

        var endpointNodes = graph.Nodes.Where(n => n.EndpointCodes.Count > 0).ToList();
        foreach (var from in endpointNodes)
        {
            if (from.EndpointCodes.Any(sab.Contains))
            {
                continue;
            }

            var reached = new HashSet<int> { from.Id };
            var queue = new Queue<int>([from.Id]);
            while (queue.Count > 0)
            {
                foreach (var next in outgoing[queue.Dequeue()].Where(reached.Add))
                {
                    queue.Enqueue(next);
                }
            }

            var unreachable = endpointNodes
                .Where(n => !reached.Contains(n.Id) && !n.EndpointCodes.Any(sab.Contains))
                .SelectMany(n => n.EndpointCodes)
                .ToList();
            if (unreachable.Count > 0)
            {
                var source = string.Join(", ", from.EndpointCodes);
                issues.Add(new RouteGraphIssue(
                    EndpointUnreachable,
                    RouteGraphIssueSeverity.Error,
                    $"From {source} the robot cannot reach {string.Join(", ", unreachable)} following the lane directions.",
                    [.. from.EndpointCodes, .. unreachable]));
            }
        }

        foreach (var node in graph.Nodes.Where(n => n.EndpointCodes.Count == 0 && outgoing[n.Id].Count == 0))
        {
            var incoming = graph.Edges.Where(e => e.EndId == node.Id).SelectMany(e => e.EdgeCodes).Distinct().Order(StringComparer.Ordinal).ToList();
            issues.Add(new RouteGraphIssue(
                DeadEndNode,
                RouteGraphIssueSeverity.Warning,
                string.Create(CultureInfo.InvariantCulture,
                    $"Node {node.Id} at ({node.X:0.###}, {node.Y:0.###}) has no outgoing lane: a robot driving there is stuck."),
                incoming));
        }
    }

    /// <summary>Point strictly inside the ring (even-odd rule); points within <paramref name="tolerance"/> of the boundary are outside.</summary>
    private static bool Inside(IReadOnlyList<RoutePoint> ring, double x, double y, double tolerance)
    {
        var inside = false;
        for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
        {
            var (a, b) = (ring[i], ring[j]);
            if (DistanceToSegment(a.X, a.Y, b.X, b.Y, x, y) <= tolerance)
            {
                return false;
            }

            if ((a.Y > y) != (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X)
            {
                inside = !inside;
            }
        }

        return inside;
    }

    private static double DistanceToRing(IReadOnlyList<RoutePoint> ring, double x, double y)
    {
        var best = double.MaxValue;
        for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
        {
            best = Math.Min(best, DistanceToSegment(ring[i].X, ring[i].Y, ring[j].X, ring[j].Y, x, y));
        }

        return best;
    }

    private static double DistanceToSegment(double ax, double ay, double bx, double by, double x, double y)
    {
        var (dx, dy) = (bx - ax, by - ay);
        var lengthSquared = dx * dx + dy * dy;
        var t = lengthSquared == 0 ? 0 : Math.Clamp(((x - ax) * dx + (y - ay) * dy) / lengthSquared, 0, 1);
        return Math.Sqrt(Math.Pow(ax + t * dx - x, 2) + Math.Pow(ay + t * dy - y, 2));
    }

    // ------------------------------------------------------------------ working graph

    private sealed class Work(RouteGraphOptions options, RouteGraphAccessContext? access)
    {
        private readonly double _tolerance = options.VertexSnapTolerance;
        private readonly List<Junction> _junctions = [];
        private IReadOnlyList<IReadOnlyList<RoutePoint>> _keepOut = [];

        public List<WorkNode> Nodes { get; } = [];
        public List<WorkSegment> Segments { get; } = [];

        public void SetKeepOut(IReadOnlyList<IReadOnlyList<RoutePoint>> keepOut) => _keepOut = keepOut;

        public void AddPolyline(RouteGraphEdgeInput edge)
        {
            var nodes = edge.Points.Select(p => FindOrAddNode(p.X, p.Y)).ToList();
            for (var i = 1; i < nodes.Count; i++)
            {
                var (a, b) = (nodes[i - 1], nodes[i]);
                if (a == b)
                {
                    continue; // zero-length step
                }

                AddSegment(a, b, edge.Code, edge.MaxSpeed);
                if (edge.Direction == EdgeDirection.BIDIRECTIONAL)
                {
                    AddSegment(b, a, edge.Code, edge.MaxSpeed);
                }
            }
        }

        /// <summary>Every node lying inside another segment splits it.</summary>
        public void SplitAtJunctions()
        {
            for (var n = 0; n < Nodes.Count; n++)
            {
                SplitSegmentsThrough(n);
            }
        }

        /// <summary>A node where a segment crosses the zone boundary, so pieces are either inside or outside.</summary>
        public void SplitAtBoundary(IReadOnlyList<RoutePoint> ring)
        {
            var crossings = new List<(double X, double Y)>();
            foreach (var segment in Segments)
            {
                var (a, b) = (Nodes[segment.Start], Nodes[segment.End]);
                var length = Math.Sqrt(Square(b.X - a.X) + Square(b.Y - a.Y));
                for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
                {
                    if (Intersection(a.X, a.Y, b.X, b.Y, ring[j].X, ring[j].Y, ring[i].X, ring[i].Y) is not { } p || length == 0)
                    {
                        continue;
                    }

                    // Only a real entry / exit: just before and just after the point differ (touching a corner
                    // or running along the boundary is not a crossing).
                    var (ux, uy) = ((b.X - a.X) / length * 3 * _tolerance, (b.Y - a.Y) / length * 3 * _tolerance);
                    if (Inside(ring, p.X - ux, p.Y - uy, _tolerance) != Inside(ring, p.X + ux, p.Y + uy, _tolerance))
                    {
                        crossings.Add(p);
                    }
                }
            }

            foreach (var (x, y) in crossings)
            {
                SplitSegmentsThrough(FindOrAddNode(x, y));
            }
        }

        /// <summary>Removes the pieces inside the ring; returns the codes of the Edges that lost a piece.</summary>
        public List<string> RemoveInside(IReadOnlyList<RoutePoint> ring)
        {
            var cut = new SortedSet<string>(StringComparer.Ordinal);
            Segments.RemoveAll(s =>
            {
                if (!MidpointInside(s, ring))
                {
                    return false;
                }

                cut.UnionWith(s.EdgeCodes);
                return true;
            });
            return [.. cut];
        }

        /// <summary>
        /// Links the lane ENDS that touch a junction zone (inside it or within JunctionCaptureDistance of its edge):
        /// the last node of a one-way lane (arrival) to the first node of a one-way lane (departure); the open end of a
        /// two-way lane is both. Lanes passing through the zone and nodes already joined to other lanes take no part,
        /// so a link never runs against a lane. Prefer a straight in-zone chord; when occupancy is available and the
        /// chord is unsafe, search a clearance-safe polyline strictly inside the JUNCTION (no through-obstacle chords).
        /// </summary>
        public void ConnectJunction(string code, IReadOnlyList<RoutePoint> ring, IReadOnlyList<IReadOnlyList<RoutePoint>> keepOut)
        {
            var capture = options.JunctionCaptureDistance;
            bool InZone(WorkNode n) => Inside(ring, n.X, n.Y, 0) || DistanceToRing(ring, n.X, n.Y) <= capture;

            var lanes = Segments.Where(s => !s.IsConnector && !s.IsJunction).ToList();
            var arrivals = new SortedSet<int>();
            var departures = new SortedSet<int>();
            for (var n = 0; n < Nodes.Count; n++)
            {
                if (!InZone(Nodes[n]))
                {
                    continue;
                }

                var incoming = lanes.Count(s => s.End == n);
                var outgoing = lanes.Count(s => s.Start == n);
                var neighbours = lanes.Where(s => s.Start == n || s.End == n)
                    .Select(s => s.Start == n ? s.End : s.Start)
                    .Distinct()
                    .Count();
                if (incoming > 0 && outgoing == 0)
                {
                    arrivals.Add(n);                       // end of a one-way lane
                }
                else if (outgoing > 0 && incoming == 0)
                {
                    departures.Add(n);                     // start of a one-way lane
                }
                else if (neighbours == 1)
                {
                    arrivals.Add(n);                       // open end of a two-way lane
                    departures.Add(n);
                }
            }

            var junction = new Junction(code, ring, keepOut, arrivals, departures);
            _junctions.Add(junction);
            foreach (var from in arrivals)
            {
                foreach (var to in departures.Where(to => to != from))
                {
                    AddJunctionTransition([junction], junction.Code, from, to, isConnector: false);
                }
            }
        }

        /// <summary>
        /// Link arrivals in one JUNCTION to departures in an abutting/overlapping JUNCTION through the union of
        /// their polygons (occupancy-safe). Threshold = <see cref="RouteGraphOptions.JunctionCaptureDistance"/>.
        /// </summary>
        public void ConnectAdjacentJunctions()
        {
            if (_junctions.Count < 2)
            {
                return;
            }

            var capture = options.JunctionCaptureDistance;
            for (var i = 0; i < _junctions.Count; i++)
            {
                for (var j = i + 1; j < _junctions.Count; j++)
                {
                    var a = _junctions[i];
                    var b = _junctions[j];
                    if (MinRingDistance(a.Ring, b.Ring) > capture + 1e-9)
                    {
                        continue;
                    }

                    var cluster = new[] { a, b };
                    var label = string.CompareOrdinal(a.Code, b.Code) < 0 ? $"{a.Code}+{b.Code}" : $"{b.Code}+{a.Code}";
                    foreach (var from in a.Arrivals)
                    {
                        foreach (var to in b.Departures.Where(to => to != from))
                        {
                            AddJunctionTransition(cluster, label, from, to, isConnector: false);
                        }
                    }

                    foreach (var from in b.Arrivals)
                    {
                        foreach (var to in a.Departures.Where(to => to != from))
                        {
                            AddJunctionTransition(cluster, label, from, to, isConnector: false);
                        }
                    }
                }
            }
        }

        private static double MinRingDistance(IReadOnlyList<RoutePoint> a, IReadOnlyList<RoutePoint> b)
        {
            var best = double.PositiveInfinity;
            foreach (var p in a)
            {
                best = Math.Min(best, DistanceToRing(b, p.X, p.Y));
                if (Inside(b, p.X, p.Y, 0))
                {
                    return 0;
                }
            }

            foreach (var p in b)
            {
                best = Math.Min(best, DistanceToRing(a, p.X, p.Y));
                if (Inside(a, p.X, p.Y, 0))
                {
                    return 0;
                }
            }

            return best;
        }

        /// <summary>
        /// Arrival → departure (or portal ↔ station) transition inside one or more abutting JUNCTION polygons.
        /// With occupancy: keep only clearance-safe geometry; never emit an unsafe chord.
        /// <paramref name="allowOutsideApproach"/> permits Endpoint poses just outside the ring (spur into portals).
        /// </summary>
        private bool AddJunctionTransition(
            IReadOnlyList<Junction> cluster,
            string zoneLabel,
            int from,
            int to,
            bool isConnector,
            bool allowOutsideApproach = false)
        {
            if (from == to || Segments.Any(s => s.Start == from && s.End == to))
            {
                return false;
            }

            var a = Nodes[from];
            var b = Nodes[to];
            var primary = cluster[0];
            var inClusterChord = LinkStaysInCluster(cluster, a, b);

            bool InKeepOut(double x, double y) =>
                primary.KeepOut.Any(k => Inside(k, x, y, _tolerance));

            if (access is null)
            {
                if (!inClusterChord && !allowOutsideApproach)
                {
                    return false;
                }

                AddJunctionSegment(from, to, zoneLabel, isConnector);
                return true;
            }

            var step = Math.Max(access.GridStepMeters, 0.05);
            var half = access.RequiredHalfWidthMeters;

            if ((inClusterChord || allowOutsideApproach) &&
                ChordClearanceOk(a.X, a.Y, b.X, b.Y, step, half, access.ClearanceAt, InKeepOut))
            {
                AddJunctionSegment(from, to, zoneLabel, isConnector);
                return true;
            }

            bool InAllowed(double x, double y) => ClusterContains(cluster, x, y);
            var maxDist = allowOutsideApproach
                ? options.MaxEndpointAccessDistance
                : Math.Max(cluster.Max(j => RingDiameter(j.Ring)) + 2 * options.JunctionCaptureDistance, 0.5);
            var path = EndpointAccessPathFinder.Find(
                a.X, a.Y, b.X, b.Y,
                maxDist,
                half,
                step,
                access.ClearanceAt,
                InKeepOut,
                allowOutsideApproach ? null : InAllowed);

            if (path is null || path.Count < 2)
            {
                access.RejectedJunctionTransitions.Add(new RejectedJunctionTransition(
                    zoneLabel, a.X, a.Y, b.X, b.Y, inClusterChord ? "CLEARANCE" : "NO_PATH"));
                return false;
            }

            var nodeIds = new List<int> { from };
            for (var i = 1; i < path.Count - 1; i++)
            {
                nodeIds.Add(FindOrAddNode(path[i].X, path[i].Y));
            }

            nodeIds.Add(to);
            for (var i = 0; i < nodeIds.Count - 1; i++)
            {
                AddJunctionSegment(nodeIds[i], nodeIds[i + 1], zoneLabel, isConnector);
            }

            return true;
        }

        private bool ClusterContains(IReadOnlyList<Junction> cluster, double x, double y)
        {
            var capture = options.JunctionCaptureDistance;
            return cluster.Any(j =>
                Inside(j.Ring, x, y, 0) || DistanceToRing(j.Ring, x, y) <= capture);
        }

        private bool LinkStaysInCluster(IReadOnlyList<Junction> cluster, WorkNode a, WorkNode b)
        {
            var capture = options.JunctionCaptureDistance;
            var length = Math.Sqrt(Square(b.X - a.X) + Square(b.Y - a.Y));
            if (length <= _tolerance)
            {
                return false;
            }

            for (var d = Math.Min(capture, length / 2); d <= length - Math.Min(capture, length / 2) + 1e-9; d += 0.05)
            {
                var (x, y) = (a.X + (b.X - a.X) * d / length, a.Y + (b.Y - a.Y) * d / length);
                if (!ClusterContains(cluster, x, y) ||
                    cluster[0].KeepOut.Any(k => Inside(k, x, y, _tolerance)))
                {
                    return false;
                }
            }

            return true;
        }

        private void AddJunctionSegment(int from, int to, string junctionCode, bool isConnector)
        {
            if (from == to || Segments.Any(s => s.Start == from && s.End == to))
            {
                return;
            }

            Segments.Add(new WorkSegment(
                from,
                to,
                new HashSet<string>(StringComparer.Ordinal),
                null,
                IsConnector: isConnector,
                new HashSet<string>(StringComparer.Ordinal) { junctionCode },
                false,
                false,
                IsJunction: true));
        }

        private static bool ChordClearanceOk(
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

        private static double RingDiameter(IReadOnlyList<RoutePoint> ring)
        {
            double max = 0;
            for (var i = 0; i < ring.Count; i++)
            {
                for (var j = i + 1; j < ring.Count; j++)
                {
                    max = Math.Max(max, Math.Sqrt(Square(ring[j].X - ring[i].X) + Square(ring[j].Y - ring[i].Y)));
                }
            }

            return max;
        }

        private bool LinkStaysInside(Junction junction, WorkNode a, WorkNode b)
        {
            var capture = options.JunctionCaptureDistance;
            var length = Math.Sqrt(Square(b.X - a.X) + Square(b.Y - a.Y));
            if (length <= _tolerance)
            {
                return false;
            }

            // The ends may sit up to `capture` outside the zone; everything in between must be inside it.
            for (var d = Math.Min(capture, length / 2); d <= length - Math.Min(capture, length / 2) + 1e-9; d += 0.05)
            {
                var (x, y) = (a.X + (b.X - a.X) * d / length, a.Y + (b.Y - a.Y) * d / length);
                var inZone = Inside(junction.Ring, x, y, 0) || DistanceToRing(junction.Ring, x, y) <= _tolerance;
                if (!inZone || junction.KeepOut.Any(k => Inside(k, x, y, _tolerance)))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// Endpoint inside a JUNCTION, or within <see cref="RouteGraphOptions.MaxEndpointAccessDistance"/> of one:
        /// station stays at (x, y); link arrivals → station and station → departures (and portals of abutting
        /// junctions in the same capture cluster). Prefer this over nearest-lane foot so ONE_WAY sinks are avoided.
        /// </summary>
        private bool AttachThroughJunction(RouteGraphEndpointInput endpoint)
        {
            var ranked = _junctions
                .Select(j =>
                {
                    var inside = Inside(j.Ring, endpoint.X, endpoint.Y, 0);
                    var dist = inside ? 0.0 : DistanceToRing(j.Ring, endpoint.X, endpoint.Y);
                    return (Junction: j, Inside: inside, Dist: dist);
                })
                .Where(x => x.Inside || x.Dist <= options.MaxEndpointAccessDistance)
                .OrderBy(x => x.Dist)
                .ThenBy(x => x.Junction.Code, StringComparer.Ordinal)
                .ToList();

            foreach (var (junction, inside, _) in ranked)
            {
                // Transitive abutting cluster so Parking↔Central chains connect; portals capped by access distance.
                var cluster = BuildAbutmentCluster(junction);
                var maxAccess = options.MaxEndpointAccessDistance;
                var arrivals = cluster.SelectMany(j => j.Arrivals)
                    .Where(id => Distance(Nodes[id], endpoint.X, endpoint.Y) <= maxAccess + 1e-9)
                    .ToHashSet();
                var departures = cluster.SelectMany(j => j.Departures)
                    .Where(id => Distance(Nodes[id], endpoint.X, endpoint.Y) <= maxAccess + 1e-9)
                    .ToHashSet();
                if (arrivals.Count == 0 && departures.Count == 0)
                {
                    continue;
                }

                var added = Nodes.Count;
                var station = FindOrAddNode(endpoint.X, endpoint.Y);
                var allowOutside = !inside;
                var label = string.Join("+", cluster.Select(j => j.Code).Order(StringComparer.Ordinal));
                var linked = arrivals.Count(from =>
                                AddJunctionTransition(cluster, label, from, station, isConnector: true, allowOutside))
                            + departures.Count(to =>
                                AddJunctionTransition(cluster, label, station, to, isConnector: true, allowOutside));
                if (station == added && linked == 0)
                {
                    Nodes.RemoveAt(station);
                    continue;
                }

                Nodes[station].EndpointCodes.Add(endpoint.Code);
                return true;
            }

            return false;
        }

        private List<Junction> BuildAbutmentCluster(Junction seed)
        {
            var capture = options.JunctionCaptureDistance;
            var cluster = new List<Junction> { seed };
            var changed = true;
            while (changed)
            {
                changed = false;
                foreach (var other in _junctions)
                {
                    if (cluster.Contains(other))
                    {
                        continue;
                    }

                    if (cluster.Any(j => MinRingDistance(j.Ring, other.Ring) <= capture + 1e-9))
                    {
                        cluster.Add(other);
                        changed = true;
                    }
                }
            }

            return cluster;
        }

        public void Label(RouteGraphZoneInput zone)
        {
            for (var i = 0; i < Segments.Count; i++)
            {
                var segment = Segments[i];
                if (!MidpointInside(segment, zone.Ring))
                {
                    continue;
                }

                segment.ZoneCodes.Add(zone.Code);
                Segments[i] = zone.ZoneType switch
                {
                    ZoneType.SPEED when zone.MaxSpeed is { } limit => segment with { Speed = segment.Speed is { } s ? Math.Min(s, limit) : limit },
                    ZoneType.NO_STOP => segment with { NoStop = true },
                    ZoneType.SINGLE_OCCUPANCY => segment with { SingleOccupancy = true },
                    // JUNCTION: connectivity via IsJunction links only — do not set SingleOccupancy/NoStop labels.
                    _ => segment
                };
            }
        }

        public void AttachEndpoint(RouteGraphEndpointInput endpoint, List<RouteGraphIssue> issues)
        {
            var (_, footX, footY, distance) = NearestFoot(endpoint.X, endpoint.Y);
            if (distance <= _tolerance)
            {
                // Station stays at stored (x, y); split the lane through that pose — never move the code onto a foot.
                var stop = FindOrAddNode(endpoint.X, endpoint.Y);
                Nodes[stop].EndpointCodes.Add(endpoint.Code);
                SplitSegmentsThrough(stop);
                return;
            }

            if (AttachThroughJunction(endpoint))
            {
                return;
            }

            if (AttachLaneAccess(endpoint, footX, footY, distance, issues))
            {
                return;
            }

            var orphan = FindOrAddNode(endpoint.X, endpoint.Y);
            Nodes[orphan].EndpointCodes.Add(endpoint.Code);
            var maxAccess = options.MaxEndpointAccessDistance;
            issues.Add(new RouteGraphIssue(
                EndpointTooFar,
                RouteGraphIssueSeverity.Error,
                string.Create(CultureInfo.InvariantCulture,
                    $"Endpoint {endpoint.Code} is {distance:0.00} m from the nearest lane and has no safe access spur " +
                    $"(max {maxAccess:0.00} m, must avoid KEEP_OUT): move the Endpoint, draw a lane closer, or clear the approach."),
                [endpoint.Code]));
        }

        /// <summary>
        /// Lane-foot → station access: straight spur when clear, else local footprint BFS polyline (when access
        /// context is supplied). Both directions so the robot can leave without reversing a ONE_WAY lane centre line.
        /// </summary>
        private bool AttachLaneAccess(
            RouteGraphEndpointInput endpoint,
            double footX,
            double footY,
            double distance,
            List<RouteGraphIssue> issues)
        {
            if (distance > options.MaxEndpointAccessDistance || !double.IsFinite(distance))
            {
                return false;
            }

            bool InKeepOut(double x, double y) => _keepOut.Any(k => Inside(k, x, y, _tolerance));

            IReadOnlyList<(double X, double Y)>? path = null;
            string? failReason = null;

            if (access is null)
            {
                if (!AccessChordClearOfKeepOut(footX, footY, endpoint.X, endpoint.Y))
                {
                    failReason = "KEEP_OUT";
                }
                else
                {
                    path = [(footX, footY), (endpoint.X, endpoint.Y)];
                }
            }
            else
            {
                var step = Math.Max(access.GridStepMeters, 0.05);
                path = EndpointAccessPathFinder.Find(
                    footX,
                    footY,
                    endpoint.X,
                    endpoint.Y,
                    options.MaxEndpointAccessDistance,
                    access.RequiredHalfWidthMeters,
                    step,
                    access.ClearanceAt,
                    InKeepOut);
                if (path is null)
                {
                    failReason = AccessChordClearOfKeepOut(footX, footY, endpoint.X, endpoint.Y)
                        ? "NO_PATH"
                        : "KEEP_OUT";
                }
            }

            if (path is null)
            {
                var blocked = FindOrAddNode(endpoint.X, endpoint.Y);
                Nodes[blocked].EndpointCodes.Add(endpoint.Code);
                access?.RejectedPaths.Add(new RejectedAccessPath(
                    endpoint.Code, footX, footY, endpoint.X, endpoint.Y, failReason ?? "NO_PATH"));
                issues.Add(new RouteGraphIssue(
                    ServiceAccessBlocked,
                    RouteGraphIssueSeverity.Error,
                    string.Create(CultureInfo.InvariantCulture,
                        $"Endpoint {endpoint.Code}: service access blocked ({failReason ?? "NO_PATH"}) from nearest lane foot."),
                    [endpoint.Code]));
                return true;
            }

            var foot = FindOrAddNode(footX, footY);
            SplitSegmentsThrough(foot);
            var station = FindOrAddNode(endpoint.X, endpoint.Y);
            var nodeIds = new List<int> { foot };
            for (var i = 1; i < path.Count - 1; i++)
            {
                nodeIds.Add(FindOrAddNode(path[i].X, path[i].Y));
            }

            nodeIds.Add(station);
            for (var i = 0; i < nodeIds.Count - 1; i++)
            {
                AddLaneAccessConnector(nodeIds[i], nodeIds[i + 1]);
                AddLaneAccessConnector(nodeIds[i + 1], nodeIds[i]);
            }

            Nodes[station].EndpointCodes.Add(endpoint.Code);
            return true;
        }

        private void AddLaneAccessConnector(int from, int to)
        {
            if (from == to || Segments.Any(s => s.Start == from && s.End == to))
            {
                return;
            }

            Segments.Add(new WorkSegment(
                from,
                to,
                new HashSet<string>(StringComparer.Ordinal),
                null,
                IsConnector: true,
                new HashSet<string>(StringComparer.Ordinal),
                false,
                false,
                IsJunction: false));
        }

        private bool AccessChordClearOfKeepOut(double x0, double y0, double x1, double y1)
        {
            if (_keepOut.Count == 0)
            {
                return true;
            }

            var length = Math.Sqrt(Square(x1 - x0) + Square(y1 - y0));
            if (length <= _tolerance)
            {
                return false;
            }

            for (var d = 0.0; d <= length + 1e-9; d += 0.05)
            {
                var t = d / length;
                var (x, y) = (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
                if (_keepOut.Any(k => Inside(k, x, y, _tolerance)))
                {
                    return false;
                }
            }

            return true;
        }

        public RouteGraph Freeze(string name, string frameId)
        {
            var merged = Segments
                .Where(s => s.Start != s.End)
                .GroupBy(s => (s.Start, s.End))
                .Select(g => new WorkSegment(
                    g.Key.Start,
                    g.Key.End,
                    g.SelectMany(s => s.EdgeCodes).ToHashSet(StringComparer.Ordinal),
                    g.Min(s => s.Speed),
                    g.All(s => s.IsConnector),
                    g.SelectMany(s => s.ZoneCodes).ToHashSet(StringComparer.Ordinal),
                    g.Any(s => s.NoStop),
                    g.Any(s => s.SingleOccupancy),
                    g.All(s => s.IsJunction)))
                .ToList();

            // Nodes left without any segment (e.g. inside a KEEP_OUT zone) are dropped unless they carry an Endpoint.
            var used = merged.SelectMany(s => new[] { s.Start, s.End }).ToHashSet();
            var ordered = Nodes
                .Select((node, index) => (node, index))
                .Where(x => used.Contains(x.index) || x.node.EndpointCodes.Count > 0)
                .OrderBy(x => Math.Round(x.node.X, 4))
                .ThenBy(x => Math.Round(x.node.Y, 4))
                .ThenBy(x => string.Join(",", x.node.EndpointCodes.Order(StringComparer.Ordinal)), StringComparer.Ordinal)
                .ToList();
            var ids = new Dictionary<int, int>();
            var nodes = new List<RouteGraphNode>();
            foreach (var (node, index) in ordered)
            {
                ids[index] = nodes.Count + 1;
                nodes.Add(new RouteGraphNode(
                    nodes.Count + 1,
                    node.X,
                    node.Y,
                    node.EndpointCodes.Order(StringComparer.Ordinal).ToList()));
            }

            var edges = merged
                .Select(s => (Start: ids[s.Start], End: ids[s.End], s))
                .OrderBy(x => x.Start)
                .ThenBy(x => x.End)
                .Select((x, i) => new RouteGraphEdge(
                    nodes.Count + 1 + i,
                    x.Start,
                    x.End,
                    x.s.EdgeCodes.Order(StringComparer.Ordinal).ToList(),
                    x.s.Speed,
                    x.s.IsConnector,
                    x.s.ZoneCodes.Order(StringComparer.Ordinal).ToList(),
                    x.s.NoStop,
                    x.s.SingleOccupancy,
                    x.s.IsJunction))
                .ToList();

            return new RouteGraph(name, frameId, nodes, edges);
        }

        private bool MidpointInside(WorkSegment segment, IReadOnlyList<RoutePoint> ring)
        {
            var (a, b) = (Nodes[segment.Start], Nodes[segment.End]);
            return Inside(ring, (a.X + b.X) / 2, (a.Y + b.Y) / 2, _tolerance);
        }

        private int FindOrAddNode(double x, double y) =>
            NearestNode(x, y, drivableOnly: false) is { } index && Distance(Nodes[index], x, y) <= _tolerance ? index : AddNode(x, y);

        private int AddNode(double x, double y)
        {
            Nodes.Add(new WorkNode(x, y, new HashSet<string>(StringComparer.Ordinal)));
            return Nodes.Count - 1;
        }

        /// <param name="drivableOnly">Only nodes still on a segment (not left over inside a KEEP_OUT zone).</param>
        private int? NearestNode(double x, double y, bool drivableOnly)
        {
            var onSegment = drivableOnly ? Segments.SelectMany(s => new[] { s.Start, s.End }).ToHashSet() : null;
            int? best = null;
            var bestDistance = double.MaxValue;
            for (var i = 0; i < Nodes.Count; i++)
            {
                if (onSegment is not null && !onSegment.Contains(i) && Nodes[i].EndpointCodes.Count == 0)
                {
                    continue;
                }

                var d = Distance(Nodes[i], x, y);
                if (d < bestDistance)
                {
                    (best, bestDistance) = (i, d);
                }
            }

            return best;
        }

        private void AddSegment(int start, int end, string code, double? speed) =>
            Segments.Add(new WorkSegment(start, end, new HashSet<string>(StringComparer.Ordinal) { code }, speed, false,
                new HashSet<string>(StringComparer.Ordinal), false, false));

        /// <summary>Splits every segment whose interior passes through node <paramref name="node"/>.</summary>
        private void SplitSegmentsThrough(int node)
        {
            var (x, y) = (Nodes[node].X, Nodes[node].Y);
            for (var i = 0; i < Segments.Count; i++)
            {
                var segment = Segments[i];
                if (segment.Start == node || segment.End == node)
                {
                    continue;
                }

                var (a, b) = (Nodes[segment.Start], Nodes[segment.End]);
                var (footX, footY, t, length) = Project(a, b, x, y);
                var inside = t * length > _tolerance && (1 - t) * length > _tolerance;
                if (inside && Math.Sqrt(Square(footX - x) + Square(footY - y)) <= _tolerance)
                {
                    Segments[i] = segment with { End = node };
                    Segments.Add(segment with
                    {
                        Start = node,
                        EdgeCodes = new HashSet<string>(segment.EdgeCodes, StringComparer.Ordinal),
                        ZoneCodes = new HashSet<string>(segment.ZoneCodes, StringComparer.Ordinal)
                    });
                }
            }
        }

        private (int Segment, double FootX, double FootY, double Distance) NearestFoot(double x, double y)
        {
            var best = (Segment: -1, FootX: 0.0, FootY: 0.0, Distance: double.MaxValue);
            for (var i = 0; i < Segments.Count; i++)
            {
                if (Segments[i].IsConnector || Segments[i].IsJunction)
                {
                    continue; // attach to drawn lanes, not to a connector or a diagonal junction link
                }

                var (footX, footY, _, _) = Project(Nodes[Segments[i].Start], Nodes[Segments[i].End], x, y);
                var d = Math.Sqrt(Square(footX - x) + Square(footY - y));
                if (d < best.Distance - 1e-9)
                {
                    best = (i, footX, footY, d);
                }
            }

            return best;
        }

        /// <summary>Crossing point of segment P1P2 with segment Q1Q2 strictly inside P1P2 (not at its ends).</summary>
        private (double X, double Y)? Intersection(
            double p1x, double p1y, double p2x, double p2y, double q1x, double q1y, double q2x, double q2y)
        {
            var (rx, ry, sx, sy) = (p2x - p1x, p2y - p1y, q2x - q1x, q2y - q1y);
            var denominator = rx * sy - ry * sx;
            if (Math.Abs(denominator) < 1e-12)
            {
                return null; // parallel or collinear: a lane along the boundary is not a crossing
            }

            var t = ((q1x - p1x) * sy - (q1y - p1y) * sx) / denominator;
            var u = ((q1x - p1x) * ry - (q1y - p1y) * rx) / denominator;
            var length = Math.Sqrt(rx * rx + ry * ry);
            if (u < 0 || u > 1 || t * length <= _tolerance || (1 - t) * length <= _tolerance)
            {
                return null;
            }

            return (p1x + t * rx, p1y + t * ry);
        }

        private static (double FootX, double FootY, double T, double Length) Project(WorkNode a, WorkNode b, double x, double y)
        {
            var (dx, dy) = (b.X - a.X, b.Y - a.Y);
            var lengthSquared = Square(dx) + Square(dy);
            if (lengthSquared == 0)
            {
                return (a.X, a.Y, 0, 0);
            }

            var t = Math.Clamp(((x - a.X) * dx + (y - a.Y) * dy) / lengthSquared, 0, 1);
            return (a.X + t * dx, a.Y + t * dy, t, Math.Sqrt(lengthSquared));
        }

        private static double Distance(WorkNode node, double x, double y) => Math.Sqrt(Square(node.X - x) + Square(node.Y - y));

        private static double Square(double v) => v * v;
    }

    private sealed record WorkNode(double X, double Y, HashSet<string> EndpointCodes);

    /// <summary>A junction zone and its lane ends (node indexes), kept to reach Endpoints through the zone.</summary>
    private sealed record Junction(
        string Code,
        IReadOnlyList<RoutePoint> Ring,
        IReadOnlyList<IReadOnlyList<RoutePoint>> KeepOut,
        IReadOnlyCollection<int> Arrivals,
        IReadOnlyCollection<int> Departures);

    private sealed record WorkSegment(
        int Start,
        int End,
        HashSet<string> EdgeCodes,
        double? Speed,
        bool IsConnector,
        HashSet<string> ZoneCodes,
        bool NoStop,
        bool SingleOccupancy,
        bool IsJunction = false)
    {
        public static WorkSegment Connector(int start, int end) =>
            new(start, end, new HashSet<string>(StringComparer.Ordinal), null, true, new HashSet<string>(StringComparer.Ordinal), false, false);
    }
}
