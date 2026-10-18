<#
.SYNOPSIS
  GĐ 2 — Đăng ký kho mô phỏng Gazebo vào backend: Warehouse, MapVersion, Endpoint, Robot RBT-SIM-01.

.DESCRIPTION
  Nguồn dữ liệu là robot repo (warotrans_simulation), sinh từ warehouse_layout.yaml:
    maps/sim_warehouse.pgm + .yaml   → POST /api/navigation/warehouses/{id}/maps/import
    config/sim_endpoints.json        → POST /api/navigation/maps/{id}/endpoints   (IN1/2, A–C, OUT1/2, CHG, PARK)
                                     → POST /api/navigation/maps/{id}/zones       (Inbound / Outbound / Rack / Charging / Parking Area)
  rồi publish map, rồi POST /api/fleet/robots (RBT-SIM-01 trên map đó).

  Chạy lại nhiều lần được: nếu map đang PUBLISHED của WH-SIM có cùng nội dung (ContentHash)
  và đủ mọi endpoint, zone của layout thì dùng lại, không import thêm version mới.

  Kết quả ghi vào samples/simulation/sim-config.json (dùng cho navigate-sim.ps1 và gateway).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File samples/simulation/seed-sim.ps1
#>
param(
    [string]$BaseUrl = "http://localhost:5090",
    [string]$RobotRepo = "D:\FPT_edu\CaptoneProject\sourceCode\robotSource\warotrans",
    [string]$RobotCode = "RBT-SIM-01"
)

$script:BaseUrl = $BaseUrl
. (Join-Path $PSScriptRoot "sim-common.ps1")

$warehouseId = "33333333-3333-3333-3333-333333333333"
$simPkg = Join-Path $RobotRepo "ros2_ws\src\warotrans_simulation"
$pgmPath = Join-Path $simPkg "maps\sim_warehouse.pgm"
$yamlPath = Join-Path $simPkg "maps\sim_warehouse.yaml"
$endpointsPath = Join-Path $simPkg "config\sim_endpoints.json"
foreach ($p in @($pgmPath, $yamlPath, $endpointsPath)) {
    if (-not (Test-Path $p)) { throw "Missing $p (run generate_warehouse.py in the robot repo first)" }
}

# ---------------------------------------------------------------- 0. Warehouse
Write-Host "0. Warehouse WH-SIM" -ForegroundColor Cyan
Invoke-Psql (Read-Text (Join-Path $PSScriptRoot "00-seed.sim-warehouse.sql")) | Out-Null
Write-Host "  OK  warehouse $warehouseId"

$token = Get-AdminToken

# ---------------------------------------------------------------- 1. MapVersion (reuse if same content)
Write-Host "1. MapVersion from $pgmPath" -ForegroundColor Cyan
$pgmBytes = [System.IO.File]::ReadAllBytes($pgmPath)
$yamlBytes = [System.IO.File]::ReadAllBytes($yamlPath)
$sha = [System.Security.Cryptography.SHA256]::Create()
$localHash = (($sha.ComputeHash([byte[]]($pgmBytes + $yamlBytes)) | ForEach-Object { $_.ToString("x2") }) -join "")

$layout = (Read-Text $endpointsPath) | ConvertFrom-Json
$layoutZones = @($layout.zones | Where-Object { $_ })

# Reuse the PUBLISHED map only when it has the same image AND every endpoint / zone of the layout
# (a published map is read-only, so new endpoints or zones need a new map version).
function Test-MapComplete($candidate) {
    $eps = (Invoke-Api GET "/api/navigation/maps/$($candidate.id)/endpoints" $null $token).Body
    $zns = (Invoke-Api GET "/api/navigation/maps/$($candidate.id)/zones" $null $token).Body
    foreach ($ep in $layout.endpoints) { if (-not ($eps | Where-Object { $_.name -eq $ep.name })) { return $false } }
    foreach ($z in $layoutZones) { if (-not ($zns | Where-Object { $_.name -eq $z.name })) { return $false } }
    return $true
}

$active = Invoke-Api GET "/api/navigation/warehouses/$warehouseId/active-map" $null $token
$map = $null
if ($active.Status -eq 200 -and $active.Body.contentHash -eq $localHash -and (Test-MapComplete $active.Body)) {
    $map = $active.Body
    Write-Host "  reuse PUBLISHED $($map.code) (same content hash, endpoints and zones)"
}
else {
    # PowerShell 5.1 has no -Form: build multipart with HttpClient.
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
    $form = New-Object System.Net.Http.MultipartFormDataContent
    $form.Add((New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $yamlBytes)), "yaml", "sim_warehouse.yaml")
    $form.Add((New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $pgmBytes)), "pgm", "sim_warehouse.pgm")
    $form.Add((New-Object System.Net.Http.StringContent("Gazebo sim_warehouse")), "name")
    $resp = $client.PostAsync("$BaseUrl/api/navigation/warehouses/$warehouseId/maps/import", $form).Result
    $raw = $resp.Content.ReadAsStringAsync().Result
    Assert-Status @{ Status = [int]$resp.StatusCode; Raw = $raw } 201 "import map (yaml + pgm)"
    $map = $raw | ConvertFrom-Json
    Save-Text "01-map.import.response.json" (Format-Json $raw)

    # Endpoints and zones can only be created while the map is DRAFT.
    foreach ($ep in $layout.endpoints) {
        $body = @{
            name = $ep.name; endpointType = $ep.endpointType
            x = $ep.x; y = $ep.y; yaw = $ep.yaw
            positionTolerance = 0.15; yawTolerance = 0.25
        } | ConvertTo-Json -Compress
        $r = Invoke-Api POST "/api/navigation/maps/$($map.id)/endpoints" $body $token
        Assert-Status $r 201 "create endpoint $($ep.code) ($($ep.x), $($ep.y))"
    }
    foreach ($z in $layoutZones) {
        # PowerShell 5.1 ConvertTo-Json mangles nested arrays: write the GeoJSON ring by hand.
        $inv = [System.Globalization.CultureInfo]::InvariantCulture
        $ring = ($z.polygon | ForEach-Object { "[{0},{1}]" -f ([double]$_[0]).ToString($inv), ([double]$_[1]).ToString($inv) }) -join ","
        $zone = @{ name = $z.name; zoneType = $z.zoneType; capacity = [int]$z.capacity; isActive = $true; geometry = "__GEOMETRY__" }
        if ($null -ne $z.maxSpeed) { $zone.maxSpeed = [double]$z.maxSpeed }
        $body = ($zone | ConvertTo-Json -Compress).Replace('"__GEOMETRY__"', "{`"type`":`"Polygon`",`"coordinates`":[[$ring]]}")
        $r = Invoke-Api POST "/api/navigation/maps/$($map.id)/zones" $body $token
        Assert-Status $r 201 "create zone $($z.name) ($($z.zoneType))"
    }

    $publish = Invoke-Api POST "/api/navigation/maps/$($map.id)/publish" $null $token
    Assert-Status $publish 200 "publish map"
    $map = $publish.Body
}
Write-Host "  map $($map.code) id=$($map.id) status=$($map.status)"

# ---------------------------------------------------------------- 2. Endpoints (ids for the config file)
$endpointsResp = Invoke-Api GET "/api/navigation/maps/$($map.id)/endpoints" $null $token
Assert-Status $endpointsResp 200 "list endpoints"
Save-Text "02-endpoints.json" (Format-Json $endpointsResp.Raw)
$endpointConfig = foreach ($ep in $layout.endpoints) {
    $match = $endpointsResp.Body | Where-Object { $_.name -eq $ep.name } | Select-Object -First 1
    if ($null -eq $match) { throw "Endpoint '$($ep.name)' not found on map $($map.code)" }
    [ordered]@{ alias = $ep.code; endpointId = $match.id; code = $match.code; x = $match.x; y = $match.y; yaw = $match.yaw }
}

# ---------------------------------------------------------------- 2b. Storage locations (one per rack)
# The web request composer reaches STORAGE endpoints only through a StorageLocation. There is no create API
# yet: dev-only upsert with a fixed id per rack, re-pointed to the rack's endpoint on the current map version.
$i = 0
foreach ($ep in @($layout.endpoints | Where-Object { $_.endpointType -eq "STORAGE" })) {
    $i++
    $epId = ($endpointConfig | Where-Object { $_.alias -eq $ep.code }).endpointId
    $locId = "f0000000-0000-4000-8000-{0:D12}" -f $i
    Invoke-Psql @"
INSERT INTO warehouse.storage_locations (id, warehouse_id, endpoint_id, code, name, is_active, created_at)
VALUES ('$locId', '$warehouseId', '$epId', 'LOC-SIM-$($ep.code)', '$($ep.name)', TRUE, now())
ON CONFLICT (id) DO UPDATE SET endpoint_id = EXCLUDED.endpoint_id, code = EXCLUDED.code, name = EXCLUDED.name, is_active = TRUE;
"@ | Out-Null
    Write-Host "  storage location LOC-SIM-$($ep.code) -> endpoint $($ep.name)"
}

# ---------------------------------------------------------------- 3. Robot
Write-Host "2. Robot $RobotCode" -ForegroundColor Cyan
$list = Invoke-Api GET "/api/fleet/robots?search=$RobotCode&take=10" $null $token
Assert-Status $list 200 "list robots"
$items = if ($list.Body.items) { $list.Body.items } else { $list.Body }
$robot = $items | Where-Object { $_.code -eq $RobotCode } | Select-Object -First 1
if ($null -eq $robot) {
    $body = @{ warehouseId = $warehouseId; currentMapVersionId = $map.id; code = $RobotCode; name = "Gazebo Simulation Robot" } | ConvertTo-Json -Compress
    $reg = Invoke-Api POST "/api/fleet/robots" $body $token
    Assert-Status $reg 201 "register robot"
    $robot = $reg.Body
}
elseif ($robot.currentMapVersionId -ne $map.id) {
    # No "change map" API yet: dev-only fix so a re-imported map does not orphan the sim robot.
    Invoke-Psql "UPDATE fleet.robots SET current_map_version_id = '$($map.id)', name = 'Gazebo Simulation Robot', updated_at = now() WHERE code = '$RobotCode';" | Out-Null
    Write-Host "  robot moved to map $($map.code) (dev SQL)"
    $robot = (Invoke-Api GET "/api/fleet/robots/$($robot.id)" $null $token).Body
}
else {
    Write-Host "  reuse robot $($robot.id)"
}

# ---------------------------------------------------------------- 4. Config
$config = [ordered]@{
    warehouseId = $warehouseId
    mapVersionId = $map.id
    mapVersionCode = $map.code
    robotId = $robot.id
    robotCode = $RobotCode
    endpoints = @($endpointConfig)
}
$configJson = Format-Json ($config | ConvertTo-Json -Depth 5 -Compress)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "sim-config.json"), $configJson, $script:Utf8NoBom)

Write-Host ""
Write-Host "Done. samples/simulation/sim-config.json written." -ForegroundColor Cyan
Write-Host "Start the simulated robot with the backend map code:" -ForegroundColor Cyan
Write-Host "  wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh map_version_code:=$($map.code)"
