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
        _ = await NextValueAsync($"endpoint:{normalized}", null, cancellationToken);
        return $"EP-{normalized}";
    }

    public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) =>
        NextFixedAsync("robot", "RBT-", 3, cancellationToken);

    public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("container", "CTN-", day, cancellationToken);

    public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("request", "REQ-", day, cancellationToken);

    public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        NextDailyAsync("job", "JOB-", day, cancellationToken);

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

    private async Task<long> NextValueAsync(string key, DateOnly? day, CancellationToken cancellationToken)
    {
        var dayBucket = day.HasValue
            ? new DateTimeOffset(day.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)
            : (DateTimeOffset?)null;

        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);

        var sequence = await db.CodeSequences
            .FromSqlInterpolated($"SELECT * FROM public.code_sequences WHERE key = {key} FOR UPDATE")
            .AsTracking()
            .FirstOrDefaultAsync(cancellationToken);

        if (sequence is null)
        {
            sequence = new CodeSequence
            {
                Key = key,
                NextValue = 2,
                DayBucket = dayBucket
            };
            db.CodeSequences.Add(sequence);
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            return 1;
        }

        var current = sequence.NextValue;
        sequence.NextValue = current + 1;
        sequence.DayBucket = dayBucket;
        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return current;
    }
}
