using System.Text;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Services;

namespace WaroTrans.UnitTests.Navigation;

public class MapImportAndMetadataTests
{
    [Fact]
    public void RosMapYamlParser_ReadsCoreFields()
    {
        const string yaml = """
            image: map.pgm
            resolution: 0.05
            origin: [-12.5, -8.0, 0.1]
            negate: 0
            occupied_thresh: 0.65
            free_thresh: 0.25
            """;

        var meta = RosMapYamlParser.Parse(yaml);
        Assert.Equal(0.05, meta.Resolution);
        Assert.Equal(-12.5, meta.OriginX);
        Assert.Equal(-8.0, meta.OriginY);
        Assert.Equal(0.1, meta.OriginYaw);
        Assert.False(meta.Negate);
        Assert.Equal(0.65, meta.OccupiedThreshold);
        Assert.Equal(0.25, meta.FreeThreshold);
    }

    [Fact]
    public void RosMapYamlParser_RejectsMissingResolution()
    {
        Assert.Throws<DomainValidationException>(() =>
            RosMapYamlParser.Parse("origin: [0, 0, 0]\n"));
    }

    [Fact]
    public void PgmParser_ReadsP5HeaderAndBuildsPng()
    {
        // 2x2 binary PGM
        var header = Encoding.ASCII.GetBytes("P5\n2 2\n255\n");
        var pixels = new byte[] { 0, 64, 128, 255 };
        var pgm = new byte[header.Length + pixels.Length];
        Buffer.BlockCopy(header, 0, pgm, 0, header.Length);
        Buffer.BlockCopy(pixels, 0, pgm, header.Length, pixels.Length);

        var parsed = PgmParser.ParseHeader(pgm);
        Assert.Equal(2, parsed.Width);
        Assert.Equal(2, parsed.Height);

        var png = PgmParser.ToPreviewPng(pgm, negate: false);
        Assert.True(png.Length > 8);
        Assert.Equal(0x89, png[0]);
        Assert.Equal((byte)'P', png[1]);
        Assert.Equal((byte)'N', png[2]);
        Assert.Equal((byte)'G', png[3]);
    }
}
