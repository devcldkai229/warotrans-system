<#
.SYNOPSIS
  Seed WH-REAL + warotrans_map2 + SRC/DST endpoints + RBT-001 for physical E2E.

.DESCRIPTION
  Imports the real floor map (warotrans_map2), creates two WAYPOINT endpoints from
  proposed-endpoints.json, publishes the map, binds RBT-001, seeds one PACKED container.
  Writes physical-config.json for run-job-sim.ps1 -ConfigPath.
#>
param(
    [string]$BaseUrl = "http://localhost:5090",
    [string]$RobotRepo = "E:\programming\my_project\warotrans",
    [string]$RobotCode = "RBT-001",
    [string]$ProposedPath = ""
)

$script:BaseUrl = $BaseUrl
. (Join-Path (Split-Path -Parent $PSScriptRoot) "simulation\sim-common.ps1")
$script:SimOut = Join-Path $PSScriptRoot "responses"
New-Item -ItemType Directory -Force -Path $script:SimOut | Out-Null

$warehouseId = "44444444-4444-4444-4444-444444444444"
$mapDir = Join-Path $RobotRepo "ros2_ws\src\warotrans_navigation\maps"
$pgmPath = Join-Path $mapDir "warotrans_map2.pgm"
$yamlPath = Join-Path $mapDir "warotrans_map2.yaml"
if (-not $ProposedPath) { $ProposedPath = Join-Path $PSScriptRoot "proposed-endpoints.json" }
foreach ($p in @($pgmPath, $yamlPath, $ProposedPath)) {
    if (-not (Test-Path $p)) { throw "Missing $p" }
}

$proposed = (Read-Text $ProposedPath) | ConvertFrom-Json
$layoutEndpoints = @(
    [pscustomobject]@{
        code = "SRC"; name = "Physical SRC"; endpointType = "WAYPOINT"
        x = [double]$proposed.src.x; y = [double]$proposed.src.y; yaw = [double]$proposed.src.yaw
    },
    [pscustomobject]@{
        code = "DST"; name = "Physical DST"; endpointType = "WAYPOINT"
        x = [double]$proposed.dst.x; y = [double]$proposed.dst.y; yaw = [double]$proposed.dst.yaw
    }
)

Write-Host "0. Warehouse WH-REAL" -ForegroundColor Cyan
Invoke-Psql (Read-Text (Join-Path $PSScriptRoot "00-seed.physical-warehouse.sql")) | Out-Null
Write-Host "  OK  warehouse $warehouseId"

$token = Get-AdminToken

Write-Host "1. MapVersion from warotrans_map2" -ForegroundColor Cyan
$pgmBytes = [System.IO.File]::ReadAllBytes($pgmPath)
$yamlBytes = [System.IO.File]::ReadAllBytes($yamlPath)
$sha = [System.Security.Cryptography.SHA256]::Create()
$localHash = (($sha.ComputeHash([byte[]]($pgmBytes + $yamlBytes)) | ForEach-Object { $_.ToString("x2") }) -join "")

function Test-MapComplete($candidate) {
    $eps = (Invoke-Api GET "/api/navigation/maps/$($candidate.id)/endpoints" $null $token).Body
    foreach ($ep in $layoutEndpoints) {
        if (-not ($eps | Where-Object { $_.name -eq $ep.name })) { return $false }
    }
    return $true
}

$active = Invoke-Api GET "/api/navigation/warehouses/$warehouseId/active-map" $null $token
$map = $null
if ($active.Status -eq 200 -and $active.Body.contentHash -eq $localHash -and (Test-MapComplete $active.Body)) {
    $map = $active.Body
    Write-Host "  reuse PUBLISHED $($map.code)"
}
else {
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
    $form = New-Object System.Net.Http.MultipartFormDataContent
    $form.Add((New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $yamlBytes)), "yaml", "warotrans_map2.yaml")
    $form.Add((New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $pgmBytes)), "pgm", "warotrans_map2.pgm")
    $form.Add((New-Object System.Net.Http.StringContent("Physical warotrans_map2")), "name")
    $resp = $client.PostAsync("$BaseUrl/api/navigation/warehouses/$warehouseId/maps/import", $form).Result
    $raw = $resp.Content.ReadAsStringAsync().Result
    Assert-Status @{ Status = [int]$resp.StatusCode; Raw = $raw } 201 "import map2"
    $map = $raw | ConvertFrom-Json
    Save-Text "01-map.import.response.json" (Format-Json $raw)

    foreach ($ep in $layoutEndpoints) {
        $body = @{
            name = $ep.name; endpointType = $ep.endpointType
            x = $ep.x; y = $ep.y; yaw = $ep.yaw
            positionTolerance = 0.20; yawTolerance = 0.35
        } | ConvertTo-Json -Compress
        $r = Invoke-Api POST "/api/navigation/maps/$($map.id)/endpoints" $body $token
        Assert-Status $r 201 "create endpoint $($ep.code) ($($ep.x), $($ep.y))"
    }

    $publish = Invoke-Api POST "/api/navigation/maps/$($map.id)/publish" $null $token
    Assert-Status $publish 200 "publish map"
    $map = $publish.Body
}
Write-Host "  map $($map.code) id=$($map.id) status=$($map.status)"

$endpointsResp = Invoke-Api GET "/api/navigation/maps/$($map.id)/endpoints" $null $token
Assert-Status $endpointsResp 200 "list endpoints"
Save-Text "02-endpoints.json" (Format-Json $endpointsResp.Raw)
$endpointConfig = foreach ($ep in $layoutEndpoints) {
    $match = $endpointsResp.Body | Where-Object { $_.name -eq $ep.name } | Select-Object -First 1
    if ($null -eq $match) { throw "Endpoint '$($ep.name)' not found on map $($map.code)" }
    [ordered]@{ alias = $ep.code; endpointId = $match.id; code = $match.code; x = $match.x; y = $match.y; yaw = $match.yaw }
}

# Storage location for DST (web composer / put-away destination)
$dstEpId = ($endpointConfig | Where-Object { $_.alias -eq "DST" }).endpointId
$locId = "f1000000-0000-4000-8000-000000000001"
Invoke-Psql @"
INSERT INTO warehouse.storage_locations (id, warehouse_id, endpoint_id, code, name, is_active, created_at)
VALUES ('$locId', '$warehouseId', '$dstEpId', 'LOC-REAL-DST', 'Physical DST', TRUE, now())
ON CONFLICT (id) DO UPDATE SET endpoint_id = EXCLUDED.endpoint_id, code = EXCLUDED.code, name = EXCLUDED.name, is_active = TRUE;
"@ | Out-Null
Write-Host "  storage location LOC-REAL-DST -> DST"

Write-Host "2. Robot $RobotCode" -ForegroundColor Cyan
$list = Invoke-Api GET "/api/fleet/robots?search=$RobotCode&take=10" $null $token
Assert-Status $list 200 "list robots"
$items = if ($list.Body.items) { $list.Body.items } else { $list.Body }
$robot = $items | Where-Object { $_.code -eq $RobotCode } | Select-Object -First 1
if ($null -eq $robot) {
    $body = @{ warehouseId = $warehouseId; currentMapVersionId = $map.id; code = $RobotCode; name = "Physical Robot RBT-001" } | ConvertTo-Json -Compress
    $reg = Invoke-Api POST "/api/fleet/robots" $body $token
    Assert-Status $reg 201 "register robot"
    $robot = $reg.Body
}
else {
    # Dev SQL: re-point existing RBT-001 to WH-REAL map2 (no change-map API yet).
    Invoke-Psql @"
UPDATE fleet.robots
SET warehouse_id = '$warehouseId',
    current_map_version_id = '$($map.id)',
    map_version_code = '$($map.code)',
    battery_percent = COALESCE(battery_percent, 85),
    name = 'Physical Robot RBT-001',
    updated_at = now()
WHERE code = '$RobotCode';
"@ | Out-Null
    Write-Host "  robot re-pointed to map $($map.code) (dev SQL)"
    $robot = (Invoke-Api GET "/api/fleet/robots/$($robot.id)" $null $token).Body
}

Write-Host "3. Container CTN-REAL-000001" -ForegroundColor Cyan
Invoke-Psql (Read-Text (Join-Path $PSScriptRoot "01-seed.physical-containers.sql")) | Out-Null

$config = [ordered]@{
    warehouseId = $warehouseId
    mapVersionId = $map.id
    mapVersionCode = $map.code
    robotId = $robot.id
    robotCode = $RobotCode
    mqttHostForRobot = "10.3.69.168"
    endpoints = @($endpointConfig)
    containerId = "e7000000-0000-4000-8000-000000000007"
    containerBarcode = "CTN-REAL-000001"
    proposed = $proposed
}
$configJson = Format-Json ($config | ConvertTo-Json -Depth 8 -Compress)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "physical-config.json"), $configJson, $script:Utf8NoBom)
Save-Text "01-config.json" $configJson

Write-Host ""
Write-Host "Done. samples/physical-e2e/physical-config.json written." -ForegroundColor Cyan
Write-Host "  mapVersionCode=$($map.code) robot=$RobotCode SRC->DST" -ForegroundColor Cyan
