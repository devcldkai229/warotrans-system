using System.Globalization;
using System.Text;

namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// ROS occupancy grid loaded from PGM bytes + MapVersion metadata.
/// Unknown cells are treated as obstacles. Distance transform is metres to nearest obstacle.
/// </summary>
public sealed class OccupancyGrid
{
    private readonly float[] _clearanceMeters;

    private OccupancyGrid(
        int width,
        int height,
        double resolution,
        double originX,
        double originY,
        bool[] occupied,
        float[] clearanceMeters)
    {
        Width = width;
        Height = height;
        Resolution = resolution;
        OriginX = originX;
        OriginY = originY;
        Occupied = occupied;
        _clearanceMeters = clearanceMeters;
    }

    public int Width { get; }
    public int Height { get; }
    public double Resolution { get; }
    public double OriginX { get; }
    public double OriginY { get; }
    public bool[] Occupied { get; }

    public static OccupancyGrid Load(
        ReadOnlySpan<byte> pgmBytes,
        double resolution,
        double originX,
        double originY,
        bool negate,
        double occupiedThreshold,
        double freeThreshold)
    {
        if (resolution <= 0 || !double.IsFinite(resolution))
        {
            throw new ArgumentOutOfRangeException(nameof(resolution), "Resolution must be a finite number > 0.");
        }

        var (width, height, pixels) = ParsePgm(pgmBytes);
        var occupied = new bool[width * height];
        for (var i = 0; i < pixels.Length; i++)
        {
            // ROS: white (255) = free when negate=0; probability = (255 - value)/255 or value/255 when negate.
            var value = pixels[i];
            double occ;
            if (negate)
            {
                occ = value / 255.0;
            }
            else
            {
                occ = (255 - value) / 255.0;
            }

            // Trinary like map_server: occ ≥ occupied_thresh is occupied, occ ≤ free_thresh is free, the band in
            // between is unknown. Clearance is conservative, so only clearly free cells are traversable.
            _ = occupiedThreshold;
            occupied[i] = occ >= freeThreshold;
        }

        var clearance = ChamferDistanceTransform(occupied, width, height, (float)resolution);
        return new OccupancyGrid(width, height, resolution, originX, originY, occupied, clearance);
    }

    /// <summary>Clearance in metres at world (x,y); 0 if outside the grid or on an obstacle.</summary>
    public double ClearanceAt(double x, double y)
    {
        if (!TryWorldToCell(x, y, out var col, out var row))
        {
            return 0;
        }

        return _clearanceMeters[row * Width + col];
    }

    /// <summary>
    /// Minimum clearance sampled along the segment (inclusive ends), step ≈ resolution.
    /// </summary>
    public double MinClearanceAlong(double x0, double y0, double x1, double y1)
    {
        var dx = x1 - x0;
        var dy = y1 - y0;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length < 1e-9)
        {
            return ClearanceAt(x0, y0);
        }

        var step = Math.Max(Resolution, 0.02);
        var samples = Math.Max(1, (int)Math.Ceiling(length / step));
        var min = double.PositiveInfinity;
        for (var i = 0; i <= samples; i++)
        {
            var t = (double)i / samples;
            min = Math.Min(min, ClearanceAt(x0 + dx * t, y0 + dy * t));
        }

        return min;
    }

    /// <summary>
    /// World → cell. PGM rows are stored top row first while map_server's origin is the bottom-left pixel,
    /// so the row counted up from the origin is flipped (ROS map_server / GAZEBO_COORDINATE_CONTRACT).
    /// </summary>
    public bool TryWorldToCell(double x, double y, out int col, out int row)
    {
        col = (int)Math.Floor((x - OriginX) / Resolution);
        var rowFromBottom = (int)Math.Floor((y - OriginY) / Resolution);
        row = Height - 1 - rowFromBottom;
        return col >= 0 && rowFromBottom >= 0 && col < Width && rowFromBottom < Height;
    }

    /// <summary>Content hash of the obstacle mask + geometry (part of the traffic graph hash).</summary>
    public string Fingerprint => _fingerprint ??= ComputeFingerprint();

    private string? _fingerprint;

    private string ComputeFingerprint()
    {
        var bits = new byte[(Occupied.Length + 7) / 8];
        for (var i = 0; i < Occupied.Length; i++)
        {
            if (Occupied[i])
            {
                bits[i >> 3] |= (byte)(1 << (i & 7));
            }
        }

        var header = Encoding.ASCII.GetBytes(string.Create(CultureInfo.InvariantCulture,
            $"{Width}x{Height}@{Resolution:R}|{OriginX:R},{OriginY:R}|"));
        return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData([.. header, .. bits])).ToLowerInvariant();
    }

    private static (int Width, int Height, byte[] Pixels) ParsePgm(ReadOnlySpan<byte> bytes)
    {
        var offset = 0;
        var magic = ReadToken(bytes, ref offset);
        if (magic is not ("P5" or "P2"))
        {
            throw new InvalidDataException("Occupancy PGM must be P2 or P5.");
        }

        var width = int.Parse(ReadToken(bytes, ref offset), CultureInfo.InvariantCulture);
        var height = int.Parse(ReadToken(bytes, ref offset), CultureInfo.InvariantCulture);
        var maxVal = int.Parse(ReadToken(bytes, ref offset), CultureInfo.InvariantCulture);
        if (width <= 0 || height <= 0 || maxVal <= 0 || maxVal > 255)
        {
            throw new InvalidDataException("Invalid PGM header dimensions / maxval.");
        }

        // Skip single whitespace after maxval for binary.
        if (offset < bytes.Length && bytes[offset] is (byte)'\r' or (byte)'\n' or (byte)' ' or (byte)'\t')
        {
            offset++;
            if (offset < bytes.Length && bytes[offset - 1] == (byte)'\r' && bytes[offset] == (byte)'\n')
            {
                offset++;
            }
        }

        var count = width * height;
        var pixels = new byte[count];
        if (magic == "P5")
        {
            if (bytes.Length - offset < count)
            {
                throw new InvalidDataException("PGM P5 payload shorter than width*height.");
            }

            bytes.Slice(offset, count).CopyTo(pixels);
            if (maxVal != 255)
            {
                for (var i = 0; i < count; i++)
                {
                    pixels[i] = (byte)(pixels[i] * 255 / maxVal);
                }
            }
        }
        else
        {
            for (var i = 0; i < count; i++)
            {
                var token = ReadToken(bytes, ref offset);
                var v = int.Parse(token, CultureInfo.InvariantCulture);
                pixels[i] = (byte)(v * 255 / maxVal);
            }
        }

        return (width, height, pixels);
    }

    private static string ReadToken(ReadOnlySpan<byte> bytes, ref int offset)
    {
        while (true)
        {
            SkipWhitespace(bytes, ref offset);
            if (offset >= bytes.Length)
            {
                throw new InvalidDataException("Unexpected end of PGM header.");
            }

            if (bytes[offset] == (byte)'#')
            {
                while (offset < bytes.Length && bytes[offset] != (byte)'\n')
                {
                    offset++;
                }

                continue;
            }

            var start = offset;
            while (offset < bytes.Length &&
                   bytes[offset] is not ((byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n' or (byte)'#'))
            {
                offset++;
            }

            return Encoding.ASCII.GetString(bytes.Slice(start, offset - start));
        }
    }

    private static void SkipWhitespace(ReadOnlySpan<byte> bytes, ref int offset)
    {
        while (offset < bytes.Length &&
               bytes[offset] is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n')
        {
            offset++;
        }
    }

    /// <summary>3-4 chamfer distance transform; result in metres.</summary>
    private static float[] ChamferDistanceTransform(bool[] occupied, int width, int height, float resolution)
    {
        const float inf = 1e12f;
        var dist = new float[occupied.Length];
        for (var i = 0; i < occupied.Length; i++)
        {
            dist[i] = occupied[i] ? 0f : inf;
        }

        // Forward pass
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var i = y * width + x;
                if (dist[i] == 0) continue;
                var best = dist[i];
                if (x > 0) best = Math.Min(best, dist[i - 1] + 3);
                if (x > 0 && y > 0) best = Math.Min(best, dist[i - width - 1] + 4);
                if (y > 0) best = Math.Min(best, dist[i - width] + 3);
                if (x + 1 < width && y > 0) best = Math.Min(best, dist[i - width + 1] + 4);
                dist[i] = best;
            }
        }

        // Backward pass
        for (var y = height - 1; y >= 0; y--)
        {
            for (var x = width - 1; x >= 0; x--)
            {
                var i = y * width + x;
                if (dist[i] == 0) continue;
                var best = dist[i];
                if (x + 1 < width) best = Math.Min(best, dist[i + 1] + 3);
                if (x + 1 < width && y + 1 < height) best = Math.Min(best, dist[i + width + 1] + 4);
                if (y + 1 < height) best = Math.Min(best, dist[i + width] + 3);
                if (x > 0 && y + 1 < height) best = Math.Min(best, dist[i + width - 1] + 4);
                dist[i] = best;
            }
        }

        // Chamfer unit ≈ resolution/3 for orthogonal steps of cost 3.
        var scale = resolution / 3f;
        // No obstacles → treat clearance as "large" (map diagonal), not zero.
        var maxClearance = Math.Max(width, height) * resolution * 2f;
        var hasObstacle = false;
        for (var i = 0; i < occupied.Length; i++)
        {
            if (occupied[i])
            {
                hasObstacle = true;
                break;
            }
        }

        for (var i = 0; i < dist.Length; i++)
        {
            if (!hasObstacle)
            {
                dist[i] = maxClearance;
            }
            else
            {
                dist[i] = dist[i] >= inf / 2 ? 0f : dist[i] * scale;
            }
        }

        return dist;
    }
}
