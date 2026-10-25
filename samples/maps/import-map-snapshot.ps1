# Import a map snapshot written by export-map-snapshot.ps1 into the local dev database, so a teammate gets the same
# map, Endpoints, lanes (Edges) and Zones as set up on the web:
#   powershell -ExecutionPolicy Bypass -File samples/maps/import-map-snapshot.ps1 -Snapshot samples/maps/MAP-WHSIM-V018
#
# What it does (re-runnable; the backend may be running):
#   1. WH-SIM warehouse when the snapshot is for it (samples/simulation/00-seed.sim-warehouse.sql).
#   2. The map version with its original id, PUBLISHED; the warehouse's other PUBLISHED version becomes ARCHIVED.
#      Version number / code are kept unless that number is already used by another map in this database, then the
#      next free number is used (printed). An earlier import of the same snapshot is replaced.
#   3. Endpoints, Edges, Zones, Endpoint groups with their original ids and codes.
#   4. map.pgm / map.yaml / map-preview.png into backend/src/WaroTrans.Host/data/maps/<warehouse>/<map>/.
#   5. Robot RBT-SIM-01 (if registered) moved to the map, and samples/simulation/sim-config.json pointed at it.
param(
    [Parameter(Mandatory = $true)][string]$Snapshot,
    [string]$RobotCode = "RBT-SIM-01",
    [string]$Container = "warotrans-postgres",
    [string]$Database = "warotrans"
)
$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "../..")
$dir = Resolve-Path $Snapshot
$jsonPath = Join-Path $dir "snapshot.json"
if (-not (Test-Path $jsonPath)) { throw "No snapshot.json in $dir" }
$jsonText = [IO.File]::ReadAllText($jsonPath, [Text.Encoding]::UTF8)
$snap = $jsonText | ConvertFrom-Json
if ($snap.format -ne "warotrans-map-snapshot/1") { throw "Unknown snapshot format '$($snap.format)'." }
if ($jsonText.Contains('$snap$')) { throw "snapshot.json contains the SQL quote tag `$snap`$." }
$map = $snap.mapVersion

function Invoke-Psql([string]$sql) {
    $out = $sql | docker exec -i $Container psql -U warotrans -d $Database -v ON_ERROR_STOP=1 -q -t -A
    if ($LASTEXITCODE -ne 0) { throw "psql failed" }
    ($out -join "`n").Trim()
}

if ($map.warehouse_id -eq "33333333-3333-3333-3333-333333333333") {
    Invoke-Psql ([IO.File]::ReadAllText((Join-Path $repo "samples/simulation/00-seed.sim-warehouse.sql"))) | Out-Null
}
$warehouse = Invoke-Psql "SELECT code FROM warehouse.warehouses WHERE id = '$($map.warehouse_id)';"
if (-not $warehouse) { throw "Warehouse $($map.warehouse_id) does not exist in this database: create it first." }

$robot = $RobotCode.Replace("'", "''")
$code = Invoke-Psql @"
BEGIN;
DO `$do`$
DECLARE
  snap jsonb := `$snap`$$jsonText`$snap`$::jsonb;
  mv jsonb := snap->'mapVersion';
  map_id uuid := (mv->>'id')::uuid;
  wh uuid := (mv->>'warehouse_id')::uuid;
  vno int := (mv->>'version_no')::int;
  vcode text := mv->>'code';
  base_uri text := '/map-assets/' || (mv->>'warehouse_id') || '/' || (mv->>'id');
BEGIN
  -- an earlier import of this same map is replaced
  DELETE FROM navigation.endpoint_group_members
   WHERE endpoint_group_id IN (SELECT id FROM navigation.endpoint_groups WHERE map_version_id = map_id);
  DELETE FROM navigation.endpoint_groups WHERE map_version_id = map_id;
  DELETE FROM navigation.endpoints WHERE map_version_id = map_id;
  DELETE FROM navigation.edges WHERE map_version_id = map_id;
  DELETE FROM navigation.zones WHERE map_version_id = map_id;
  DELETE FROM navigation.map_versions WHERE id = map_id;

  IF EXISTS (SELECT 1 FROM navigation.map_versions WHERE warehouse_id = wh AND (version_no = vno OR code = vcode)) THEN
    SELECT coalesce(max(version_no), 0) + 1 INTO vno FROM navigation.map_versions WHERE warehouse_id = wh;
    vcode := regexp_replace(vcode, 'V[0-9]+`$', 'V' || lpad(vno::text, 3, '0'));
  END IF;

  UPDATE navigation.map_versions SET status = 'ARCHIVED' WHERE warehouse_id = wh AND status = 'PUBLISHED';

  -- The files are copied next to the map's own id; it no longer points at the version it was cloned from.
  INSERT INTO navigation.map_versions
  SELECT * FROM jsonb_populate_record(null::navigation.map_versions, mv || jsonb_build_object(
    'version_no', vno, 'code', vcode, 'status', 'PUBLISHED', 'source_map_version_id', null,
    'map_uri', base_uri || '/map.pgm', 'map_yaml_uri', base_uri || '/map.yaml',
    'preview_image_uri', base_uri || '/map-preview.png'));
  INSERT INTO navigation.endpoints SELECT * FROM jsonb_populate_recordset(null::navigation.endpoints, snap->'endpoints');
  -- source endpoints belong to versions that do not exist here
  UPDATE navigation.endpoints SET source_endpoint_id = null WHERE map_version_id = map_id;
  INSERT INTO navigation.edges SELECT * FROM jsonb_populate_recordset(null::navigation.edges, snap->'edges');
  INSERT INTO navigation.zones SELECT * FROM jsonb_populate_recordset(null::navigation.zones, snap->'zones');
  INSERT INTO navigation.endpoint_groups
  SELECT * FROM jsonb_populate_recordset(null::navigation.endpoint_groups, snap->'endpointGroups');
  INSERT INTO navigation.endpoint_group_members
  SELECT * FROM jsonb_populate_recordset(null::navigation.endpoint_group_members, snap->'endpointGroupMembers');

  UPDATE fleet.robots SET current_map_version_id = map_id, updated_at = now() WHERE code = '$robot';
END
`$do`$;
COMMIT;
SELECT code FROM navigation.map_versions WHERE id = '$($map.id)';
"@

$target = Join-Path $repo ("backend/src/WaroTrans.Host/data/maps/{0}/{1}" -f $map.warehouse_id, $map.id)
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($file in @("map.pgm", "map.yaml", "map-preview.png")) {
    $source = Join-Path $dir $file
    if (Test-Path $source) { Copy-Item $source (Join-Path $target $file) -Force }
}

$simConfig = Join-Path $repo "samples/simulation/sim-config.json"
$robotRow = Invoke-Psql "SELECT id FROM fleet.robots WHERE code = '$robot';"
if ($robotRow) {
    $config = [ordered]@{
        warehouseId    = $map.warehouse_id
        mapVersionId   = $map.id
        mapVersionCode = $code
        robotId        = $robotRow
        robotCode      = $RobotCode
        endpoints      = @()
    }
    [IO.File]::WriteAllText($simConfig, ($config | ConvertTo-Json) + "`n", (New-Object Text.UTF8Encoding $false))
}

Write-Host ("Imported {0} (id {1}, PUBLISHED): {2} endpoints, {3} edges, {4} zones; files -> {5}" -f `
    $code, $map.id, @($snap.endpoints).Count, @($snap.edges).Count, @($snap.zones).Count, $target)
if ($code -ne $map.code) { Write-Host "Note: $($map.code) was already taken here, imported as $code." }
if ($robotRow) { Write-Host "$RobotCode -> $code; sim-config.json updated (restart the simulation)." }
else { Write-Host "Robot $RobotCode not registered here (samples/simulation/seed-sim.ps1 registers it)." }
Write-Host "Gazebo: python3 scripts/sync_web_map.py --map-id $($map.id) --user admin --password '...' (robot repo)"
