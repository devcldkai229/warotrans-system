$ErrorActionPreference = "Stop"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Invoke-Json {
  param($Method, $Uri, $Headers, $Body)
  $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers; ContentType = "application/json" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress) }
  return Invoke-RestMethod @params
}

# 1) Unlock published map for geometry fix (same id/codes preserved)
docker exec warotrans-postgres psql -U warotrans -d warotrans -v ON_ERROR_STOP=1 -c `
  "UPDATE navigation.map_versions SET status = 'DRAFT' WHERE id = '$mapId' AND status = 'PUBLISHED';"
Write-Host "V001 set to DRAFT"

$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 2) Load edge/endpoint ids
$edges = docker exec warotrans-postgres psql -U warotrans -d warotrans -t -A -F '|' -c `
  "SELECT id, code, geometry::text, width_meters, direction, capacity, max_speed, is_active FROM navigation.edges WHERE map_version_id = '$mapId' ORDER BY code;"
$eps = docker exec warotrans-postgres psql -U warotrans -d warotrans -t -A -F '|' -c `
  "SELECT id, code, name, endpoint_type, x, y, yaw, position_tolerance, yaw_tolerance, is_enabled FROM navigation.endpoints WHERE map_version_id = '$mapId' ORDER BY code;"

# 3) Convert existing ONE_WAY edges to BIDIRECTIONAL (keeps geometry)
foreach ($line in $edges) {
  if (-not $line.Trim()) { continue }
  $p = $line.Split('|')
  $id = $p[0]; $code = $p[1]; $geomText = $p[2]; $width = [double]$p[3]; $dir = $p[4]; $cap = [int]$p[5]
  $maxSpeed = if ($p[6]) { [double]$p[6] } else { $null }
  $active = ($p[7] -eq 't')
  $geom = $geomText | ConvertFrom-Json
  $body = @{
    geometry = @{ type = "LineString"; coordinates = @(@($geom.coordinates | ForEach-Object { ,@([double]$_[0], [double]$_[1]) })) }
    widthMeters = $width
    direction = "BIDIRECTIONAL"
    capacity = $cap
    maxSpeed = $maxSpeed
    isActive = $active
  }
  # Fix coordinates nesting for PowerShell
  $coords = @()
  foreach ($c in $geom.coordinates) { $coords += , @([double]$c[0], [double]$c[1]) }
  $body.geometry = @{ type = "LineString"; coordinates = $coords }
  Invoke-Json -Method PUT -Uri "http://127.0.0.1:5090/api/navigation/edges/$id" -Headers $h -Body $body | Out-Null
  Write-Host "EDGE $code -> BIDIRECTIONAL"
}

# 4) Add missing connector / access lanes
$newEdges = @(
  @{ name = "J13-to-J2-riser"; coords = @(@(-0.40,-0.99), @(-0.40,-0.35)); width = 0.55 },
  @{ name = "south-to-outbound"; coords = @(@(-0.40,-0.99), @(+1.80,-0.99)); width = 0.55 },
  @{ name = "right-vertical"; coords = @(@(+1.80,-0.99), @(+1.80,+1.70)); width = 0.55 },
  @{ name = "north-cross-to-inbound"; coords = @(@(+0.10,+1.50), @(+1.80,+1.50)); width = 0.50 },
  @{ name = "shelfA-connector"; coords = @(@(-0.70,+0.75), @(-1.25,+0.75)); width = 0.45 },
  @{ name = "shelfA-vertical"; coords = @(@(-1.25,+0.45), @(-1.25,+1.70)); width = 0.45 },
  @{ name = "shelfB-spur"; coords = @(@(+0.10,+1.35), @(+0.85,+1.35)); width = 0.45 },
  @{ name = "shelfC-spur"; coords = @(@(+0.80,-0.99), @(+0.80,-0.75)); width = 0.45 },
  @{ name = "wait-spur"; coords = @(@(+1.30,+0.20), @(+1.30,+0.85)); width = 0.45 }
)

foreach ($e in $newEdges) {
  $body = @{
    geometry = @{ type = "LineString"; coordinates = $e.coords }
    widthMeters = $e.width
    direction = "BIDIRECTIONAL"
    capacity = 1
    maxSpeed = $null
    isActive = $true
  }
  $resp = Invoke-Json -Method POST -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/edges" -Headers $h -Body $body
  Write-Host "CREATED $($resp.code) ($($e.name))"
}

# 5) Snap too-far shelf endpoints onto new lanes (preserve names/types/yaw)
$snap = @{
  "EP-WAYPOINT-8"  = @{ x = -1.25; y = 0.604 }   # Shelf-A-01
  "EP-WAYPOINT-9"  = @{ x = -1.25; y = 0.953 }   # Shelf-A-02
  "EP-WAYPOINT-10" = @{ x = -1.25; y = 1.343 }   # Shelf-A-03
  "EP-WAYPOINT-11" = @{ x = -1.25; y = 1.664 }   # Shelf-A-04
  "EP-WAYPOINT-17" = @{ x = 0.85;  y = 0.994 }   # Shelf-B-03 near spur/vertical
  "EP-WAYPOINT-16" = @{ x = 0.577; y = 1.35 }    # Shelf-B-04 onto spur
  "EP-WAYPOINT-12" = @{ x = 0.80;  y = -0.771 }  # Shelf-C-01 on spur
  "EP-WAYPOINT-13" = @{ x = 0.80;  y = -0.99 }   # Shelf-C-02 on south lane
}

foreach ($line in $eps) {
  if (-not $line.Trim()) { continue }
  $p = $line.Split('|')
  $id = $p[0]; $code = $p[1]; $name = $p[2]; $type = $p[3]
  $x = [double]$p[4]; $y = [double]$p[5]; $yaw = [double]$p[6]
  $ptol = [double]$p[7]; $ytol = [double]$p[8]; $en = ($p[9] -eq 't')
  if ($snap.ContainsKey($code)) {
    $x = $snap[$code].x; $y = $snap[$code].y
    $body = @{
      name = $name; endpointType = $type; x = $x; y = $y; yaw = $yaw
      positionTolerance = $ptol; yawTolerance = $ytol; isEnabled = $en
    }
    Invoke-Json -Method PUT -Uri "http://127.0.0.1:5090/api/navigation/endpoints/$id" -Headers $h -Body $body | Out-Null
    Write-Host "SNAP $code -> ($x, $y)"
  }
}

# 6) Validate
$val = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h
$val | ConvertTo-Json -Depth 20 | Set-Content "$outDir\validation-after-fix.json" -Encoding UTF8
$errs = @($val.issues | Where-Object { $_.severity -eq "ERROR" })
$warns = @($val.issues | Where-Object { $_.severity -eq "WARNING" })
Write-Host "isValid=$($val.isValid) errors=$($errs.Count) warnings=$($warns.Count) hash=$($val.graphHash)"
$errs | ForEach-Object { Write-Host "ERR [$($_.code)] $($_.message)" }

if ($errs.Count -gt 0) {
  Write-Host "GEOMETRY_STILL_INVALID - not publishing"
  exit 2
}

# 7) Publish
$pub = Invoke-Json -Method POST -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/publish" -Headers $h -Body $null
Write-Host "PUBLISHED $($pub.code) status=$($pub.status)"

# 8) Export route-graph
try {
  $r2 = Invoke-WebRequest -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h -UseBasicParsing
  $r2.Content | Set-Content "$outDir\route-graph.geojson" -Encoding UTF8
  $gh = $r2.Headers["X-Route-Graph-Hash"]
  Write-Host "ROUTE_GRAPH_OK hash=$gh len=$($r2.Content.Length)"
} catch {
  $resp = $_.Exception.Response
  $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
  $body = $sr.ReadToEnd()
  $body | Set-Content "$outDir\route-graph-error.json" -Encoding UTF8
  Write-Host "ROUTE_GRAPH_FAIL $body"
  exit 3
}

# Copy occupancy into samples
$src = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host\data\maps\42cfe65f-7727-4dd2-a66b-b9b93dc2d549\$mapId"
Copy-Item "$src\map.pgm","$src\map.yaml","$src\map-preview.png" -Destination $outDir -Force

@"
mapId=$mapId
code=MAP-WH42CFE65F-V001
warehouse=WH-42CFE65F
validationIsValid=$($val.isValid)
validationGraphHash=$($val.graphHash)
runtimeRouteGraphHash=$gh
geometryFix=BIDIRECTIONAL_EXISTING_PLUS_9_CONNECTORS_AND_SHELF_SNAPS
exportedAt=$(Get-Date -Format o)
"@ | Set-Content "$outDir\EXPORT_META.txt" -Encoding UTF8

Write-Host "DONE"
