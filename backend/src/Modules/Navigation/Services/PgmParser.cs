using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.Navigation.Services;

public sealed record PgmHeader(int Width, int Height, int MaxValue, int DataOffset);

public static class PgmParser
{
    public static PgmHeader ParseHeader(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < 3)
        {
            throw new DomainValidationException("PGM file is too short.", "pgm_invalid");
        }

        var magic = Encoding.ASCII.GetString(bytes[..2]);
        if (magic is not ("P5" or "P2"))
        {
            throw new DomainValidationException(
                "Only PGM P5 (binary) or P2 (ASCII) formats are supported.",
                "pgm_invalid");
        }

        var offset = 2;
        SkipWhitespaceAndComments(bytes, ref offset);
        var width = ReadInt(bytes, ref offset);
        SkipWhitespaceAndComments(bytes, ref offset);
        var height = ReadInt(bytes, ref offset);
        SkipWhitespaceAndComments(bytes, ref offset);
        var maxValue = ReadInt(bytes, ref offset);
        if (offset < bytes.Length && (bytes[offset] == (byte)'\n' || bytes[offset] == (byte)'\r' || bytes[offset] == (byte)' '))
        {
            offset++;
            if (offset < bytes.Length && bytes[offset - 1] == (byte)'\r' && bytes[offset] == (byte)'\n')
            {
                offset++;
            }
        }

        if (width <= 0 || height <= 0 || maxValue <= 0 || maxValue > 255)
        {
            throw new DomainValidationException(
                "PGM width/height must be > 0 and maxval must be in 1..255.",
                "pgm_invalid");
        }

        return new PgmHeader(width, height, maxValue, offset);
    }

    public static byte[] ToPreviewPng(byte[] pgmBytes, bool negate)
    {
        var header = ParseHeader(pgmBytes);
        var pixels = new byte[header.Width * header.Height];

        if (Encoding.ASCII.GetString(pgmBytes.AsSpan(0, 2)) == "P5")
        {
            var expected = header.Width * header.Height;
            if (pgmBytes.Length < header.DataOffset + expected)
            {
                throw new DomainValidationException("PGM pixel data is truncated.", "pgm_invalid");
            }

            var data = pgmBytes.AsSpan(header.DataOffset, expected);
            for (var i = 0; i < expected; i++)
            {
                var v = data[i];
                if (header.MaxValue != 255)
                {
                    v = (byte)(v * 255 / header.MaxValue);
                }

                pixels[i] = negate ? (byte)(255 - v) : v;
            }
        }
        else
        {
            var text = Encoding.ASCII.GetString(pgmBytes.AsSpan(header.DataOffset));
            var tokens = text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (tokens.Length < header.Width * header.Height)
            {
                throw new DomainValidationException("PGM ASCII pixel data is truncated.", "pgm_invalid");
            }

            for (var i = 0; i < pixels.Length; i++)
            {
                if (!int.TryParse(tokens[i], out var raw))
                {
                    throw new DomainValidationException("Invalid PGM ASCII pixel value.", "pgm_invalid");
                }

                var v = (byte)Math.Clamp(raw * 255 / header.MaxValue, 0, 255);
                pixels[i] = negate ? (byte)(255 - v) : v;
            }
        }

        return EncodeGrayscalePng(header.Width, header.Height, pixels);
    }

    /// <summary>Minimal 8-bit grayscale PNG encoder (no external imaging library).</summary>
    private static byte[] EncodeGrayscalePng(int width, int height, byte[] pixels)
    {
        using var ms = new MemoryStream();
        // PNG signature
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        Span<byte> ihdr = stackalloc byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr[..4], width);
        BinaryPrimitives.WriteInt32BigEndian(ihdr[4..8], height);
        ihdr[8] = 8;   // bit depth
        ihdr[9] = 0;   // grayscale
        ihdr[10] = 0;  // compression
        ihdr[11] = 0;  // filter
        ihdr[12] = 0;  // interlace
        WriteChunk(ms, "IHDR", ihdr);

        var raw = new byte[(width + 1) * height];
        for (var y = 0; y < height; y++)
        {
            var rowStart = y * (width + 1);
            raw[rowStart] = 0; // filter None
            Buffer.BlockCopy(pixels, y * width, raw, rowStart + 1, width);
        }

        using var compressed = new MemoryStream();
        using (var deflate = new ZLibStream(compressed, CompressionLevel.Fastest, leaveOpen: true))
        {
            deflate.Write(raw);
        }

        WriteChunk(ms, "IDAT", compressed.ToArray());
        WriteChunk(ms, "IEND", ReadOnlySpan<byte>.Empty);
        return ms.ToArray();
    }

    private static void WriteChunk(Stream stream, string type, ReadOnlySpan<byte> data)
    {
        Span<byte> length = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(length, data.Length);
        stream.Write(length);

        var typeBytes = Encoding.ASCII.GetBytes(type);
        stream.Write(typeBytes);

        stream.Write(data);

        var crc = Crc32.Compute(typeBytes, data);
        Span<byte> crcBytes = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(crcBytes, crc);
        stream.Write(crcBytes);
    }

    private static void SkipWhitespaceAndComments(ReadOnlySpan<byte> bytes, ref int offset)
    {
        while (offset < bytes.Length)
        {
            var b = bytes[offset];
            if (b is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n')
            {
                offset++;
                continue;
            }

            if (b == (byte)'#')
            {
                while (offset < bytes.Length && bytes[offset] != (byte)'\n')
                {
                    offset++;
                }

                continue;
            }

            break;
        }
    }

    private static int ReadInt(ReadOnlySpan<byte> bytes, ref int offset)
    {
        SkipWhitespaceAndComments(bytes, ref offset);
        var start = offset;
        while (offset < bytes.Length && bytes[offset] is >= (byte)'0' and <= (byte)'9')
        {
            offset++;
        }

        if (start == offset)
        {
            throw new DomainValidationException("Malformed PGM header integer.", "pgm_invalid");
        }

        return int.Parse(Encoding.ASCII.GetString(bytes[start..offset]));
    }

    private static class Crc32
    {
        private static readonly uint[] Table = CreateTable();

        private static uint[] CreateTable()
        {
            var table = new uint[256];
            for (uint i = 0; i < 256; i++)
            {
                var c = i;
                for (var k = 0; k < 8; k++)
                {
                    c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                }

                table[i] = c;
            }

            return table;
        }

        public static uint Compute(ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
        {
            uint crc = 0xFFFFFFFFu;
            foreach (var b in type)
            {
                crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
            }

            foreach (var b in data)
            {
                crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
            }

            return crc ^ 0xFFFFFFFFu;
        }
    }
}
