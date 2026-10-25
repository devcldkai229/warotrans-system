# Export one map version (as set up in the web Map Editor) into a folder that can be committed and imported on
# another machine with import-map-snapshot.ps1:
#   <out>/snapshot.json       navigation rows: map_version, endpoints, edges, zones, endpoint groups (+ members)
#   <out>/map.pgm, map.yaml, map-preview.png   the occupancy map files from backend data/maps
#
#   powershell -ExecutionPolicy Bypass -File samples/maps/export-map-snapshot.ps1 -MapCode MAP-WHSIM-V018
#
# Reads the dev PostgreSQL through `docker exec` (container warotrans-postgres, like samples/simulation).
param(
    [Parameter(Mandatory = $true)][string]$MapCode,
    [string]$OutDir = "",
    [string]$Container = "warotrans-postgres",
    [string]$Database = "warotrans"
)
$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "../..")
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot $MapCode }

function Invoke-Psql([string]$sql) {
    $out = $sql | docker exec -i $Container psql -U warotrans -d $Database -v ON_ERROR_STOP=1 -q -t -A
    if ($LASTEXITCODE -ne 0) { throw "psql failed" }
    ($out -join "`n").Trim()
}

$code = $MapCode.Replace("'", "''")
$json = Invoke-Psql @"
SELECT jsonb_pretty(jsonb_build_object(
  'format', 'warotrans-map-snapshot/1',
  'exportedAt', now(),
  'mapVersion', (SELECT to_jsonb(m) FROM navigation.map_versions m WHERE m.code = '$code'),
  'endpoints', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.code), '[]') FROM navigation.endpoints e
                JOIN navigation.map_versions m ON m.id = e.map_version_id WHERE m.code = '$code'),
  'edges', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.code), '[]') FROM navigation.edges e
            JOIN navigation.map_versions m ON m.id = e.map_version_id WHERE m.code = '$code'),
  'zones', (SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.code), '[]') FROM navigation.zones z
            JOIN navigation.map_versions m ON m.id = z.map_version_id WHERE m.code = '$code'),
  'endpointGroups', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.code), '[]') FROM navigation.endpoint_groups g
                     JOIN navigation.map_versions m ON m.id = g.map_version_id WHERE m.code = '$code'),
  'endpointGroupMembers', (SELECT coalesce(jsonb_agg(to_jsonb(gm) ORDER BY gm.endpoint_group_id, gm.endpoint_id), '[]')
                           FROM navigation.endpoint_group_members gm
                           JOIN navigation.endpoint_groups g ON g.id = gm.endpoint_group_id
                           JOIN navigation.map_versions m ON m.id = g.map_version_id WHERE m.code = '$code')
));
"@
$snapshot = $json | ConvertFrom-Json
if (-not $snapshot.mapVersion) { throw "Map version '$MapCode' not found." }
if ($snapshot.mapVersion.code -ne $MapCode) { throw "Unexpected map '$($snapshot.mapVersion.code)'." }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
[IO.File]::WriteAllText((Join-Path $OutDir "snapshot.json"), $json + "`n", (New-Object Text.UTF8Encoding $false))

# The map files live under backend data/maps; a clone keeps the files of the version it was cloned from, so follow
# the URIs rather than the map id.
$dataMaps = Join-Path $repo "backend/src/WaroTrans.Host/data/maps"
foreach ($uri in @($snapshot.mapVersion.map_uri, $snapshot.mapVersion.map_yaml_uri, $snapshot.mapVersion.preview_image_uri)) {
    if (-not $uri) { continue }
    $relative = $uri -replace '^/map-assets/', ''
    $source = Join-Path $dataMaps $relative
    if (-not (Test-Path $source)) { throw "Map file not found: $source" }
    Copy-Item $source (Join-Path $OutDir (Split-Path $relative -Leaf)) -Force
}

Write-Host ("Exported {0} ({1}): {2} endpoints, {3} edges, {4} zones, {5} endpoint groups -> {6}" -f `
    $snapshot.mapVersion.code, $snapshot.mapVersion.status, @($snapshot.endpoints).Count, @($snapshot.edges).Count,
    @($snapshot.zones).Count, @($snapshot.endpointGroups).Count, $OutDir)
