$ErrorActionPreference = "Stop"
$BaseUrl = "http://127.0.0.1:5090"
. "E:\programming\my_project\warotrans-system\samples\simulation\sim-common.ps1"
$script:BaseUrl = $BaseUrl

$warehouseId = "42cfe65f-7727-4dd2-a66b-b9b93dc2d549"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$robotCode = "RBT-SIM-01"

$token = Get-AdminToken

# Endpoints on V001
$epsResp = Invoke-Api GET "/api/navigation/maps/$mapId/endpoints" $null $token
Assert-Status $epsResp 200 "list endpoints"
$byCode = @{}
foreach ($e in $epsResp.Body) { $byCode[$e.code] = $e }

# Aliases for sim-config / E2E
$aliasMap = [ordered]@{
  IN     = "EP-WAYPOINT-1"   # Inbound Area
  OUT    = "EP-WAYPOINT-2"   # Outbound Area
  QC     = "EP-WAYPOINT-3"   # Inspection
  WAIT   = "EP-WAYPOINT-4"
  PARK   = "EP-PARK-5"
  PARK2  = "EP-PARK-6"
  CHG    = "EP-CHARGER-7"
  S01    = "EP-WAYPOINT-8"   # Shelf-A-01
  S02    = "EP-WAYPOINT-9"   # Shelf-A-02
  S03    = "EP-WAYPOINT-10"  # Shelf-A-03
  S04    = "EP-WAYPOINT-12"  # Shelf-C-01
}

$endpointConfig = @()
foreach ($alias in $aliasMap.Keys) {
  $code = $aliasMap[$alias]
  $e = $byCode[$code]
  if (-not $e) { throw "Missing endpoint $code" }
  $endpointConfig += [ordered]@{
    alias = $alias; endpointId = $e.id; code = $e.code; x = $e.x; y = $e.y; yaw = $e.yaw; name = $e.name
  }
}

# Storage locations for shelf aliases (fixed ids for run-job-sim compatibility)
$shelfAliases = @("S01","S02","S03","S04")
$i = 0
foreach ($alias in $shelfAliases) {
  $i++
  $ep = $endpointConfig | Where-Object { $_.alias -eq $alias } | Select-Object -First 1
  $locId = "f2000000-0000-4000-8000-{0:D12}" -f $i
  $code = "LOC-WH42-$alias"
  $name = $ep.name
  # Upsert via SQL (repoint endpoint); then ensure active
  $sql = @"
INSERT INTO warehouse.storage_locations (id, warehouse_id, endpoint_id, code, name, is_active, created_at)
VALUES ('$locId', '$warehouseId', '$($ep.endpointId)', '$code', '$name', TRUE, now())
ON CONFLICT (id) DO UPDATE
  SET warehouse_id = EXCLUDED.warehouse_id,
      endpoint_id = EXCLUDED.endpoint_id,
      code = EXCLUDED.code,
      name = EXCLUDED.name,
      is_active = TRUE;
"@
  docker exec -i warotrans-postgres psql -U warotrans -d warotrans -v ON_ERROR_STOP=1 -c $sql | Out-Null
  Write-Host "  storage $code -> $($ep.code)"
}

# Register or rebind robot
$list = Invoke-Api GET "/api/fleet/robots?search=$robotCode&take=10" $null $token
Assert-Status $list 200 "list robots"
$items = if ($list.Body.items) { $list.Body.items } else { @($list.Body) }
$robot = $items | Where-Object { $_.code -eq $robotCode } | Select-Object -First 1
if ($null -eq $robot) {
  $body = @{ warehouseId = $warehouseId; currentMapVersionId = $mapId; code = $robotCode; name = "Gazebo Simulation Robot" } | ConvertTo-Json -Compress
  $reg = Invoke-Api POST "/api/fleet/robots" $body $token
  Assert-Status $reg 201 "register robot"
  $robot = $reg.Body
} else {
  docker exec warotrans-postgres psql -U warotrans -d warotrans -c @"
UPDATE fleet.robots
SET warehouse_id = '$warehouseId',
    current_map_version_id = '$mapId',
    map_version_code = 'MAP-WH42CFE65F-V001',
    name = 'Gazebo Simulation Robot',
    is_enabled = TRUE,
    status = 'AVAILABLE',
    updated_at = now()
WHERE code = '$robotCode';
"@ | Out-Null
  $robot = (Invoke-Api GET "/api/fleet/robots/$($robot.id)" $null $token).Body
  Write-Host "  robot rebound to MAP-WH42CFE65F-V001"
}
# Newly registered robots stay OFFLINE until a command cycle; sim needs AVAILABLE to start jobs.
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE fleet.robots SET status='AVAILABLE', updated_at=now() WHERE code='$robotCode' AND status='OFFLINE';" | Out-Null

$config = [ordered]@{
  warehouseId = $warehouseId
  mapVersionId = $mapId
  mapVersionCode = "MAP-WH42CFE65F-V001"
  robotId = $robot.id
  robotCode = $robotCode
  endpoints = @($endpointConfig)
  storageLocations = [ordered]@{
    S01 = "f2000000-0000-4000-8000-000000000001"
    S02 = "f2000000-0000-4000-8000-000000000002"
    S03 = "f2000000-0000-4000-8000-000000000003"
    S04 = "f2000000-0000-4000-8000-000000000004"
  }
}
$out = "E:\programming\my_project\warotrans-system\samples\simulation\sim-config.json"
[System.IO.File]::WriteAllText($out, ($config | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote $out"
Write-Host "robotId=$($robot.id) PARK=$($byCode['EP-PARK-5'].x),$($byCode['EP-PARK-5'].y) IN=$($byCode['EP-WAYPOINT-1'].x),$($byCode['EP-WAYPOINT-1'].y)"
