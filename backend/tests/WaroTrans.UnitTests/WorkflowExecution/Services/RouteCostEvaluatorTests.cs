using WaroTrans.WorkflowExecution.Services;
using static WaroTrans.WorkflowExecution.Services.RouteCostEvaluator;

namespace WaroTrans.UnitTests.WorkflowExecution.Services;

/// <summary>CHECK ROUTE_CLEAR's judgement: open, detour, shut by a robot, shut by an obstacle.</summary>
public class RouteCostEvaluatorTests
{
    // 3.0 m x 1.5 m room at 0.05 m, origin (0, 0); walls are lethal (100).
    private static CostGrid Room(Action<byte[], int, int>? draw = null)
    {
        const int w = 60, h = 30;
        var cost = new byte[w * h];
        for (var c = 0; c < w; c++)
        {
            cost[c] = 100;
            cost[(h - 1) * w + c] = 100;
        }

        for (var r = 0; r < h; r++)
        {
            cost[r * w] = 100;
            cost[r * w + w - 1] = 100;
        }

        draw?.Invoke(cost, w, h);
        return new CostGrid(w, h, 0.05, 0, 0, cost);
    }

    private static void Box(byte[] cost, int w, double x0, double y0, double x1, double y1, byte value = 100)
    {
        for (var r = (int)Math.Round(y0 / 0.05); r < (int)Math.Round(y1 / 0.05); r++)
        {
            for (var c = (int)Math.Round(x0 / 0.05); c < (int)Math.Round(x1 / 0.05); c++)
            {
                cost[r * w + c] = value;
            }
        }
    }

    [Fact]
    public void An_open_room_passes_with_its_length()
    {
        var a = Analyze(Room(), Room(), 0.3, 0.75, 2.7, 0.75, []);

        Assert.Equal(Verdict.Pass, a.Verdict);
        Assert.InRange(a.LengthMeters, 2.3, 2.6);
        Assert.True(a.LiveCostmap);
    }

    [Fact]
    public void A_new_box_with_a_way_around_is_a_reroute()
    {
        var live = Room((c, w, _) => Box(c, w, 1.3, 0.0, 1.7, 1.2));

        var a = Analyze(Room(), live, 1.0, 0.4, 2.0, 0.4, []);

        Assert.Equal(Verdict.Reroute, a.Verdict);
    }

    [Fact]
    public void A_wall_of_boxes_across_the_room_is_an_obstacle()
    {
        var live = Room((c, w, _) => Box(c, w, 1.4, 0.0, 1.6, 1.5));

        var a = Analyze(Room(), live, 0.3, 0.75, 2.7, 0.75, []);

        Assert.Equal(Verdict.BlockedByObstacle, a.Verdict);
        Assert.Null(a.BlockingRobot);
    }

    [Fact]
    public void The_same_wall_where_a_robot_stands_is_a_robot()
    {
        var robot = Guid.NewGuid();
        var live = Room((c, w, _) => Box(c, w, 1.4, 0.0, 1.6, 1.5));

        var a = Analyze(Room(), live, 0.3, 0.75, 2.7, 0.75, [(robot, 1.5, 0.75, 0.24)]);

        Assert.Equal(Verdict.BlockedByRobot, a.Verdict);
        Assert.Equal(robot, a.BlockingRobot);
    }

    [Fact]
    public void Without_a_live_costmap_the_map_decides()
    {
        var a = Analyze(Room(), null, 0.3, 0.75, 2.7, 0.75, []);

        Assert.Equal(Verdict.Pass, a.Verdict);
        Assert.False(a.LiveCostmap);
    }

    [Fact]
    public void A_narrow_way_is_counted()
    {
        // A gap 0.25 m wide: the robot passes it, but close to both sides.
        var room = Room((c, w, _) =>
        {
            Box(c, w, 1.4, 0.05, 1.6, 0.6);
            Box(c, w, 1.4, 0.85, 1.6, 1.45);
            Box(c, w, 1.35, 0.6, 1.65, 0.85, 60); // inflated band through the gap
        });

        var a = Analyze(room, room, 0.3, 0.75, 2.7, 0.75, []);

        Assert.Equal(Verdict.Pass, a.Verdict);
        Assert.True(a.NarrowCells > 0);
    }
}
