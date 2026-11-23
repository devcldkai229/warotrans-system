using WaroTrans.BuildingBlocks.Maps;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>The map's own costmap is computed with Nav2's InflationLayer formula and publisher translation.</summary>
public class StaticCostmapTests
{
    [Theory]
    [InlineData(0.0, 254)]
    [InlineData(0.10, 253)]
    [InlineData(0.15, 253)]
    [InlineData(0.40, 0)]
    public void Cost_follows_nav2_inflation(double distance, int expected) =>
        Assert.Equal(expected, StaticCostmap.Cost(distance, 0.15, 0.35, 4.0));

    [Fact]
    public void Inflation_decays_with_distance_beyond_the_inscribed_radius()
    {
        var near = StaticCostmap.Cost(0.20, 0.15, 0.35, 4.0);
        var far = StaticCostmap.Cost(0.34, 0.15, 0.35, 4.0);
        Assert.Equal((byte)(252 * Math.Exp(-4.0 * 0.05)), near);
        Assert.True(near > far && far > 0);
    }

    [Fact]
    public void Translates_like_the_costmap_publisher() =>
        Assert.Equal(new byte[] { 0, 1, 98, 99, 100 },
            new byte[] { 0, 1, 252, 253, 254 }.Select(StaticCostmap.ToOccupancy).ToArray());

    [Fact]
    public void A_wall_cell_is_lethal_and_its_neighbours_inscribed_rows_bottom_up()
    {
        // 5x3 map, wall in the top-middle cell (PGM row 0, x 2)
        var occ = new bool[15];
        occ[2] = true;
        var grid = StaticCostmap.Compute(occ, 5, 3, 0.05, 0.15, 0.35, 4.0);
        Assert.Equal(100, grid[2 * 5 + 2]);   // ROS row 2 = top
        Assert.Equal(99, grid[2 * 5 + 3]);    // 0.05 m away: inscribed
        Assert.Equal(99, grid[0 * 5 + 2]);    // 0.10 m below: inscribed
    }
}
