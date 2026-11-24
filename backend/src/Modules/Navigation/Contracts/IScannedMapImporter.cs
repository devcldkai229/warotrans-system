namespace WaroTrans.Navigation.Contracts;

/// <summary>
/// A map a robot just built (map building from the web) becomes a DRAFT map version of its warehouse, exactly as an
/// imported map.pgm + map.yaml would. Endpoints, zones and lanes are then drawn in the map editor.
/// </summary>
public interface IScannedMapImporter
{
    Task<MapVersionSnapshot> ImportScannedMapAsync(
        Guid warehouseId,
        byte[] pgm,
        string yaml,
        string name,
        CancellationToken cancellationToken = default);
}
