using System.Text;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.UnitTests.WorkflowExecution;

/// <summary>A queue point is used only when a robot waiting there leaves the goal open (decided on the map itself).</summary>
public class QueuePassabilityTests
{
    /// <summary>3 m x 3 m room (0.05 m cells, origin 0,0), and in its top-middle a dead-end bay of the given inner width
    /// (walls 0.05 m thick) running from y = 1.5 m to the top wall.</summary>
    private static string Bundle(double bayWidth)
    {
        const int n = 60;
        var px = Enumerable.Repeat((byte)254, n * n).ToArray();
        void Wall(double x0, double y0, double x1, double y1)
        {
            for (var r = 0; r < n; r++)
            {
                for (var c = 0; c < n; c++)
                {
                    var (x, y) = ((c + 0.5) * 0.05, (n - 1 - r + 0.5) * 0.05);  // PGM row 0 = top
                    if (x >= x0 && x <= x1 && y >= y0 && y <= y1)
                    {
                        px[r * n + c] = 0;
                    }
                }
            }
        }

        Wall(0, 0, 3, 0.05); Wall(0, 2.95, 3, 3); Wall(0, 0, 0.05, 3); Wall(2.95, 0, 3, 3);
        var left = 1.5 - bayWidth / 2;
        Wall(left - 0.05, 1.5, left, 3);
        Wall(1.5 + bayWidth / 2, 1.5, 1.5 + bayWidth / 2 + 0.05, 3);

        var dir = Directory.CreateTempSubdirectory("wt-queue").FullName;
        File.WriteAllBytes(Path.Combine(dir, "map.pgm"), Encoding.ASCII.GetBytes($"P5\n{n} {n}\n255\n").Concat(px).ToArray());
        File.WriteAllText(Path.Combine(dir, "map.yaml"), "image: map.pgm\nresolution: 0.05\norigin: [0.0, 0.0, 0.0]\n");
        return dir;
    }

    [Fact]
    public void A_queue_point_inside_a_narrow_dead_end_would_seal_the_goal_and_is_refused()
    {
        var dir = Bundle(bayWidth: 0.6);   // the waiting robot fills the bay: nothing passes it
        Assert.False(QueuePassability.KeepsGoalOpen(dir, 1.5, 2.6, 1.5, 1.9, Math.PI / 2, 0.18, 0.15));
    }

    [Fact]
    public void A_queue_point_at_the_side_of_a_wide_bay_leaves_the_way_past_it_open()
    {
        var dir = Bundle(bayWidth: 1.0);   // MAP-ONE-V019-like: waiting at the right side, passing on the left
        Assert.True(QueuePassability.KeepsGoalOpen(dir, 1.5, 2.6, 1.75, 1.9, Math.PI / 2, 0.18, 0.15));
    }

    [Fact]
    public void Without_a_map_there_is_no_veto() =>
        Assert.True(QueuePassability.KeepsGoalOpen(null, 0, 0, 1, 1, 0, 0.18, 0.15));
}
