using System.IO.Compression;
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

    [Fact]
    public void PgmParser_PreviewPreservesGrayscaleAndAppliesNegate()
    {
        // 5x1 strip covering occupied / mid-gray / unknown-like / near-white / free.
        var values = new byte[] { 0, 127, 205, 254, 255 };
        var pgm = BuildP5(width: 5, height: 1, maxValue: 255, values);

        var identity = DecodeGrayscalePng(PgmParser.ToPreviewPng(pgm, negate: false));
        Assert.Equal(values, identity);

        var negated = DecodeGrayscalePng(PgmParser.ToPreviewPng(pgm, negate: true));
        Assert.Equal(new byte[] { 255, 128, 50, 1, 0 }, negated);
    }

    [Fact]
    public void PgmParser_PreviewScalesWhenMaxValueIsNot255()
    {
        // maxval=100 → scale to 0..255 (50 → 127).
        var pgm = BuildP5(width: 2, height: 1, maxValue: 100, [0, 50]);
        var pixels = DecodeGrayscalePng(PgmParser.ToPreviewPng(pgm, negate: false));
        Assert.Equal(0, pixels[0]);
        Assert.Equal(127, pixels[1]);
    }

    private static byte[] BuildP5(int width, int height, int maxValue, byte[] values)
    {
        Assert.Equal(width * height, values.Length);
        var header = Encoding.ASCII.GetBytes($"P5\n{width} {height}\n{maxValue}\n");
        var pgm = new byte[header.Length + values.Length];
        Buffer.BlockCopy(header, 0, pgm, 0, header.Length);
        Buffer.BlockCopy(values, 0, pgm, header.Length, values.Length);
        return pgm;
    }

    /// <summary>Decode an 8-bit grayscale PNG produced by <see cref="PgmParser.ToPreviewPng"/>.</summary>
    private static byte[] DecodeGrayscalePng(byte[] png)
    {
        Assert.True(png.Length > 8);
        Assert.Equal(0x89, png[0]);

        var offset = 8;
        int width = 0, height = 0;
        byte bitDepth = 0, colorType = 0;
        using var idat = new MemoryStream();

        while (offset + 8 <= png.Length)
        {
            var length = (png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3];
            var type = Encoding.ASCII.GetString(png, offset + 4, 4);
            var data = png.AsSpan(offset + 8, length);

            if (type == "IHDR")
            {
                width = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
                height = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
                bitDepth = data[8];
                colorType = data[9];
            }
            else if (type == "IDAT")
            {
                idat.Write(data);
            }
            else if (type == "IEND")
            {
                break;
            }

            offset += 12 + length;
        }

        Assert.Equal(8, bitDepth);
        Assert.Equal(0, colorType); // grayscale

        using var inflated = new MemoryStream();
        using (var zlib = new ZLibStream(new MemoryStream(idat.ToArray()), CompressionMode.Decompress))
        {
            zlib.CopyTo(inflated);
        }

        var raw = inflated.ToArray();
        var pixels = new byte[width * height];
        for (var y = 0; y < height; y++)
        {
            var rowStart = y * (width + 1);
            Assert.Equal(0, raw[rowStart]); // filter None
            Buffer.BlockCopy(raw, rowStart + 1, pixels, y * width, width);
        }

        return pixels;
    }
}
