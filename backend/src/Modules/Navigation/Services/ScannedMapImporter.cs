using System.Text;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Features.ImportMapVersion;

namespace WaroTrans.Navigation.Services;

/// <summary>The same path as the PGM + YAML import (validation, preview PNG, asset store, DRAFT).</summary>
public sealed class ScannedMapImporter(ImportMapVersionHandler import) : IScannedMapImporter
{
    public async Task<MapVersionSnapshot> ImportScannedMapAsync(
        Guid warehouseId,
        byte[] pgm,
        string yaml,
        string name,
        CancellationToken cancellationToken = default)
    {
        await using var yamlStream = new MemoryStream(Encoding.UTF8.GetBytes(yaml));
        await using var pgmStream = new MemoryStream(pgm);
        var created = await import.HandleAsync(warehouseId, yamlStream, pgmStream, name, cancellationToken);
        return new MapVersionSnapshot(
            created.Id, created.WarehouseId, created.VersionNo, Enum.Parse<Enums.MapStatus>(created.Status), created.Code);
    }
}
