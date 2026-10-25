using System.Collections.Concurrent;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// Process-wide cache of compiled traffic graphs. Only PUBLISHED map versions are cached.
/// Key = (MapVersionId, GraphHash).
/// </summary>
public sealed class CompiledTrafficGraphCache
{
    private readonly ConcurrentDictionary<(Guid MapVersionId, string GraphHash), CompiledTrafficGraph> _cache = new();

    public bool TryGet(Guid mapVersionId, string graphHash, out CompiledTrafficGraph? graph) =>
        _cache.TryGetValue((mapVersionId, graphHash), out graph!);

    /// <summary>Any cached compiled graph for the map (typically the published hash).</summary>
    public bool TryGetForMap(Guid mapVersionId, out CompiledTrafficGraph? graph)
    {
        foreach (var kv in _cache)
        {
            if (kv.Key.MapVersionId == mapVersionId)
            {
                graph = kv.Value;
                return true;
            }
        }

        graph = null;
        return false;
    }

    public CompiledTrafficGraph GetOrAddPublished(
        Guid mapVersionId,
        MapStatus status,
        string graphHash,
        Func<CompiledTrafficGraph> factory)
    {
        if (status != MapStatus.PUBLISHED)
        {
            return factory();
        }

        return _cache.GetOrAdd((mapVersionId, graphHash), _ => factory());
    }

    public void SetPublished(Guid mapVersionId, MapStatus status, CompiledTrafficGraph graph)
    {
        if (status != MapStatus.PUBLISHED)
        {
            return;
        }

        _cache[(mapVersionId, graph.GraphHash)] = graph;
    }

    public void Remove(Guid mapVersionId, string? graphHash = null)
    {
        if (graphHash is not null)
        {
            _cache.TryRemove((mapVersionId, graphHash), out _);
            return;
        }

        foreach (var key in _cache.Keys.Where(k => k.MapVersionId == mapVersionId).ToList())
        {
            _cache.TryRemove(key, out _);
        }
    }

    public int Count => _cache.Count;
}
