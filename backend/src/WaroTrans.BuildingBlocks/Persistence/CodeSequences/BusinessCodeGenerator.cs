using Microsoft.EntityFrameworkCore;

namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public sealed class BusinessCodeGenerator(CodeSequenceDbContext db) : IBusinessCodeGenerator
{
    public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) =>
        NextFixedAsync("warehouse", "WH-", 3, cancellationToken);

    public async Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default)
    {
        var normalized = suffix.Trim().ToUpperInvariant().Replace(' ', '-');
        _ = await NextValueAsync($"category:{normalized}", null, cancellationToken);
        return $"CAT-{normalized}";
    }

    public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) =>
        NextPrefixedAsync($"sku:{prefix}", $"SKU-{prefix.Trim().ToUpperInvariant()}-", 6, null, cancellationToken);

    public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default)
    {
        var code = warehouseCode.Trim().ToUpperInvariant().Replace("WH-", "WH");
        return Task.FromResult($"MAP-{code}-V{versionNo:000}");
    }

    public async Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default)
    {
        var normalized = suffix.Trim().ToUpperInvariant().Replace(' ', '-');
        // Bump sequence for observability; code is stable from name. Uniqueness is (MapVersionId, Code).
        _ = await NextValueAsync($"endpoint:{normalized}", null, cancellationToken);
        return $"EP-{normalized}";
    }

    public async Task<string> NextEdgeCodeAsync(string suffix, CancellationToken cancellationToken = default)
    {
        var normalized = suffix.Trim().ToUpperInvariant().Replace(' ', '-');
        // Edges may share a display name on one map; sequence keeps Code unique per MapVersion.
        var value = await NextValueAsync($"edge:{normalized}", null, cancellationToken);
        return value == 1 ? $"EDGE-{normalized}" : $"EDGE-{normalized}---{value}";
    }

    public async Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default)
    {
        var normalized = suffix.Trim().ToUpperInvariant().Replace(' ', '-');
        _ = await NextValueAsync($"zone:{normalized}", null, cancellationToken);
        return $"ZONE-{normalized}";
    }

    public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) =>
        NextFixedAsync("robot", "RBT-", 3, cancellationToken);

    public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("container", "CTN-", day, cancellationToken);

    public async Task<IReadOnlyList<string>> NextContainerCodesAsync(int count, DateOnly? day = null, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(count, 1);
        var bucket = day ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var first = await NextValuesAsync($"container:{bucket:yyyyMMdd}", bucket, count, cancellationToken);
        return Enumerable.Range(0, count).Select(i => $"CTN-{bucket:yyyyMMdd}-{(first + i).ToString().PadLeft(6, '0')}").ToArray();
    }

    public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("request", "REQ-", day, cancellationToken);

    public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("job", "JOB-", day, cancellationToken);

    public Task<string> NextInboundVoucherCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("voucher-in", "PN-", day, cancellationToken);

    public Task<string> NextOutboundVoucherCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("voucher-out", "PX-", day, cancellationToken);

    private async Task<string> NextFixedAsync(string key, string prefix, int width, CancellationToken cancellationToken)
    {
        var value = await NextValueAsync(key, null, cancellationToken);
        return $"{prefix}{value.ToString().PadLeft(width, '0')}";
    }

    private async Task<string> NextPrefixedAsync(
        string key,
        string prefix,
        int width,
        DateOnly? day,
        CancellationToken cancellationToken)
    {
        var value = await NextValueAsync(key, day, cancellationToken);
        return $"{prefix}{value.ToString().PadLeft(width, '0')}";
    }

    private async Task<string> NextDailyAsync(
        string keyPrefix,
        string codePrefix,
        DateOnly? day,
        CancellationToken cancellationToken)
    {
        var bucket = day ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var key = $"{keyPrefix}:{bucket:yyyyMMdd}";
        var value = await NextValueAsync(key, bucket, cancellationToken);
        return $"{codePrefix}{bucket:yyyyMMdd}-{value.ToString().PadLeft(6, '0')}";
    }

    private Task<long> NextValueAsync(string key, DateOnly? day, CancellationToken cancellationToken) =>
        NextValuesAsync(key, day, 1, cancellationToken);

    private async Task<long> NextValuesAsync(string key, DateOnly? day, int count, CancellationToken cancellationToken)
    {
        var dayBucket = day.HasValue
            ? new DateTimeOffset(day.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)
            : (DateTimeOffset?)null;

        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);

        // FOR UPDATE cannot lock a row that does not exist yet, so concurrent first calls for a new key
        // would all INSERT and collide on the primary key. Create the row idempotently first, then lock it.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO public.code_sequences (key, next_value, day_bucket) VALUES ({key}, {1L}, {dayBucket}) ON CONFLICT (key) DO NOTHING",
            cancellationToken);

        var sequence = await db.CodeSequences
            .FromSqlInterpolated($"SELECT * FROM public.code_sequences WHERE key = {key} FOR UPDATE")
            .AsTracking()
            .SingleAsync(cancellationToken);

        // A scoped generator may already track this key. Reload while holding its lock so another request's
        // committed increment is not replaced by the stale tracked value on a subsequent call.
        await db.Entry(sequence).ReloadAsync(cancellationToken);
        var current = sequence.NextValue;
        sequence.NextValue = checked(current + count);
        sequence.DayBucket = dayBucket;
        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return current;
    }
}
