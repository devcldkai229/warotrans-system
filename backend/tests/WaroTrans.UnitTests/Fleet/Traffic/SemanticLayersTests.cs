using System.Text;
using WaroTrans.Fleet.Features.GetSemanticLayers;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>The admin map draws the bundle's costmap masks (keepout, speed) the robots plan with.</summary>
public class SemanticLayersTests
{
    [Fact]
    public void Reads_a_binary_pgm_with_a_comment()
    {
        var header = Encoding.ASCII.GetBytes("P5\n# made by the exporter\n3 2\n255\n");
        var pgm = header.Concat(new byte[] { 0, 100, 254, 255, 1, 2 }).ToArray();
        var (w, h, px) = Endpoint.ReadPgm(pgm)!.Value;
        Assert.Equal((3, 2), (w, h));
        Assert.Equal(new byte[] { 0, 100, 254, 255, 1, 2 }, px);
    }

    [Fact]
    public void Reads_a_mask_yaml_with_a_block_origin_and_its_image()
    {
        var dir = Directory.CreateTempSubdirectory("wt-layers").FullName;
        File.WriteAllText(Path.Combine(dir, "keepout.yaml"),
            "image: keepout.pgm\nmode: trinary\nresolution: 0.05\norigin:\n- -1.642\n- -1.966\n- 0.0\n");
        File.WriteAllBytes(Path.Combine(dir, "keepout.pgm"),
            Encoding.ASCII.GetBytes("P5 2 1 255\n").Concat(new byte[] { 0, 254 }).ToArray());
        var layer = Endpoint.TryReadMask(Path.Combine(dir, "keepout.yaml"), "keepout", "Keep-out")!;
        Assert.Equal((0.05, -1.642, -1.966, 2, 1), (layer.Resolution, layer.OriginX, layer.OriginY, layer.Width, layer.Height));
        Assert.Equal(new byte[] { 0, 254 }, Convert.FromBase64String(layer.Data));
    }

    [Fact]
    public void A_missing_or_broken_mask_is_skipped() =>
        Assert.Null(Endpoint.TryReadMask(Path.Combine(Path.GetTempPath(), "no-such.yaml"), "x", "x"));
}
