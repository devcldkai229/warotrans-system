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
}
