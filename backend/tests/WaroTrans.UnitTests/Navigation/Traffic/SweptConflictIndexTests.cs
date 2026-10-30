using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Navigation.Traffic;

public class SweptConflictIndexTests
{
    [Fact]
    public void Parallel_close_segments_conflict_far_ones_do_not()
    {
        var segments = new (int Id, double X0, double Y0, double X1, double Y1)[]
        {
            (1, 0, 0, 2, 0),
            (2, 0, 0.1, 2, 0.1), // ~0.1 m apart
            (3, 0, 2, 2, 2)      // far
        };

        var index = SweptConflictIndex.Build(segments, turnRadius: 0.226);
        Assert.True(index.Conflicts(1, 2));
        Assert.False(index.Conflicts(1, 3));
    }

    [Fact]
    public void Adjacent_segments_sharing_vertex_are_not_listed_as_conflicts()
    {
        var segments = new (int Id, double X0, double Y0, double X1, double Y1)[]
        {
            (1, 0, 0, 1, 0),
            (2, 1, 0, 2, 0)
        };

        var index = SweptConflictIndex.Build(segments, turnRadius: 0.226);
        Assert.False(index.Conflicts(1, 2));
    }

    [Fact]
    public void Conflicts_are_symmetric_for_near_miss_capsules()
    {
        // Junction chord vs short shelf spur — distances near 2r (V019-style OVERLAP_ASYMMETRIC).
        var segments = new (int Id, double X0, double Y0, double X1, double Y1)[]
        {
            (65, 0.155, -1.782, 0.716, -1.461),
            (86, 0.965, -1.929, 0.751, -1.929),
            (80, 0.691, -1.929, 0.716, -1.461),
            (69, 0.442, -1.2253, 0.442, -1.305),
        };

        var index = SweptConflictIndex.Build(segments, turnRadius: 0.226);
        foreach (var id in new[] { 65, 86, 80, 69 })
        {
            foreach (var other in index.ConflictsWith(id))
            {
                Assert.True(index.Conflicts(other, id), $"asymmetric {id}->{other}");
            }
        }
    }
}
