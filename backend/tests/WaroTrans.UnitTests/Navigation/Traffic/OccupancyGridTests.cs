using System.Text;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Navigation.Traffic;

public class OccupancyGridTests
{
    [Fact]
    public void Unknown_and_occupied_cells_are_obstacles_free_has_clearance()
    {
        // 5×5: centre free (255), neighbours mid-gray unknown (128), corners occupied (0).
        var width = 5;
        var height = 5;
        var pixels = new byte[width * height];
        for (var i = 0; i < pixels.Length; i++)
        {
            pixels[i] = 128; // unknown
        }

        pixels[2 * width + 2] = 255; // free centre
        pixels[0] = 0;
        pixels[4] = 0;

        var pgm = EncodeP5(width, height, pixels);
        var grid = OccupancyGrid.Load(pgm, resolution: 0.1, originX: 0, originY: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25);

        Assert.False(grid.Occupied[2 * width + 2]);
        Assert.True(grid.Occupied[0]);
        Assert.True(grid.Occupied[1]); // unknown → obstacle
        Assert.True(grid.ClearanceAt(0.25, 0.25) > 0); // near centre free cell world coords
    }

    [Fact]
    public void Min_clearance_along_segment_drops_near_obstacle()
    {
        var width = 30;
        var height = 10;
        var pixels = new byte[width * height];
        Array.Fill(pixels, (byte)255);
        for (var row = 0; row < height; row++)
        {
            pixels[row * width + 15] = 0; // wall
        }

        var grid = OccupancyGrid.Load(EncodeP5(width, height, pixels), 0.1, 0, 0, false, 0.65, 0.25);
        var open = grid.MinClearanceAlong(0.2, 0.5, 0.5, 0.5);
        var across = grid.MinClearanceAlong(0.5, 0.5, 2.0, 0.5);
        Assert.True(open > across);
        Assert.True(across < 0.15);
    }

    private static byte[] EncodeP5(int width, int height, byte[] pixels)
    {
        var header = Encoding.ASCII.GetBytes($"P5\n{width} {height}\n255\n");
        var result = new byte[header.Length + pixels.Length];
        header.CopyTo(result, 0);
        pixels.CopyTo(result, header.Length);
        return result;
    }
}
