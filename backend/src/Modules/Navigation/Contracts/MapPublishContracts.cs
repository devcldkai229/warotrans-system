namespace WaroTrans.Navigation.Contracts;

/// <summary>
/// A map version about to be published (or just published) in a warehouse, replacing <see cref="ReplacedMapVersionIds"/>
/// (the version published so far; empty for the first map).
/// </summary>
public sealed record MapPublishContext(
    Guid WarehouseId,
    Guid NewMapVersionId,
    string NewMapCode,
    IReadOnlyList<Guid> ReplacedMapVersionIds);

public static class MapPublishSeverity
{
    /// <summary>Publishing would break something: refused unless an Admin overrides it (when Overridable).</summary>
    public const string Block = "BLOCK";

    /// <summary>Worth knowing, publishing goes on.</summary>
    public const string Warn = "WARN";

    /// <summary>What publishing will do by itself (requests and Jobs moved to the new map).</summary>
    public const string Info = "INFO";
}

/// <summary>
/// One finding of the publish check. Subject: what it is about (workflow code, request code, robot code). Args: the
/// values in Message, so a client can say it in its own language by Code.
/// </summary>
public sealed record MapPublishIssue(
    string Severity,
    string Code,
    string Message,
    string? Subject = null,
    bool Overridable = true,
    IReadOnlyDictionary<string, string>? Args = null);

/// <summary>
/// Another module's view on a map being published: workflows that name places the new map lacks, Jobs still running on
/// the old map, requests waiting on it, robots assigned to it. Navigation cannot see those modules; they implement this.
/// </summary>
public interface IMapPublishGuard
{
    Task<IReadOnlyList<MapPublishIssue>> CheckAsync(MapPublishContext context, CancellationToken cancellationToken = default);
}

/// <summary>Runs once a map is published: moves what was waiting on the replaced map onto the new one.</summary>
public interface IMapPublishFollower
{
    Task OnPublishedAsync(MapPublishContext context, CancellationToken cancellationToken = default);
}
