# Rebuild V003 draft: remove over-dense critical zones, replace edges with a
# strongly connected ONE_WAY ring covering all stations.
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:5090"
$mapId = Get-Content "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-ONEWAY\draft_map_id.txt" -Raw
$mapId = $mapId.Trim()
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-ONEWAY"

function Invoke-Json {
  param($Method, $Uri, $Headers, $Body)
  $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers; ContentType = "application/json" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 30 -Compress) }
  return Invoke-RestMethod @params
}

$login = Invoke-RestMethod -Method POST -Uri "$base/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# --- 1) Delete JUNCTION / NO_STOP / SINGLE_OCCUPANCY (keep KEEP_OUT) ---
$zones = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/zones" -Headers $h
foreach ($z in $zones) {
  if ($z.zoneType -eq 'KEEP_OUT') {
    Write-Host "KEEP zone $($z.code)"
    continue
  }
  Invoke-RestMethod -Method DELETE -Uri "$base/api/navigation/zones/$($z.id)" -Headers $h | Out-Null
  Write-Host "DELETED zone $($z.code) $($z.zoneType)"
}

# --- 2) Delete all edges ---
$edges = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/edges" -Headers $h
foreach ($e in $edges) {
  Invoke-RestMethod -Method DELETE -Uri "$base/api/navigation/edges/$($e.id)" -Headers $h | Out-Null
  Write-Host "DELETED edge $($e.code)"
}

# --- 3) ONE_WAY ring (clockwise) + feeder spurs with exits ---
# Ring vertices (metres). Stay inside free space of 102x67@0.05 map (origin -2.929,-1.415).
# Outer free ~[-2.2..1.9] x [-1.0..1.7]
$ring = @(
  @{ name = "south-full";   coords = @(@(-2.15,-0.965), @(1.85,-0.965)); width = 0.55 },  # parks/charger/shelfC foot
  @{ name = "east-up";      coords = @(@(1.85,-0.965), @(1.85,1.62)); width = 0.55 },     # outbound/QC/inbound approach
  @{ name = "north-west";   coords = @(@(1.85,1.62), @(-1.25,1.62)); width = 0.50 },      # inbound → shelfA top
  @{ name = "shelfa-down";  coords = @(@(-1.25,1.62), @(-1.25,0.05)); width = 0.45 },     # shelf A aisle south
  @{ name = "mid-west";     coords = @(@(-1.25,0.05), @(-2.15,0.05)); width = 0.55 },
  @{ name = "west-down";    coords = @(@(-2.15,0.05), @(-2.15,-0.965)); width = 0.55 }    # close loop to south
)

# Spurs: enter from ring in travel sense, exit continuing forward onto ring (no reverse).
$spurs = @(
  # Shelf-B cluster: from north lane down to y=1.0 then east back? Better: north lane detour
  @{ name = "shelfb-in";  coords = @(@(0.10,1.62), @(0.10,1.00)); width = 0.45 },
  @{ name = "shelfb-east"; coords = @(@(0.10,1.00), @(0.85,1.00)); width = 0.45 },
  @{ name = "shelfb-up";  coords = @(@(0.85,1.00), @(0.85,1.62)); width = 0.45 },
  # Wait point: from east lane west then back
  @{ name = "wait-in";   coords = @(@(1.85,0.85), @(1.30,0.85)); width = 0.45 },
  @{ name = "wait-down"; coords = @(@(1.30,0.85), @(1.30,0.20)); width = 0.45 },
  @{ name = "wait-east"; coords = @(@(1.30,0.20), @(1.85,0.20)); width = 0.45 },
  # Shelf-C spur north of south lane then rejoin east
  @{ name = "shelfc-up";   coords = @(@(0.80,-0.965), @(0.80,-0.77)); width = 0.45 },
  @{ name = "shelfc-east"; coords = @(@(0.80,-0.77), @(1.85,-0.77)); width = 0.45 },
  @{ name = "shelfc-down"; coords = @(@(1.85,-0.77), @(1.85,-0.965)); width = 0.45 },
  # Mid cross to serve Shelf-B-02/03 style poses around (0.8,1.35)
  @{ name = "mid-north-link"; coords = @(@(0.85,1.35), @(0.85,1.00)); width = 0.40 },
  # Center vertical for Shelf-B-04 / connectivity from south mid
  @{ name = "center-up"; coords = @(@(-0.40,-0.965), @(-0.40,0.45)); width = 0.50 },
  @{ name = "center-to-shelfa"; coords = @(@(-0.40,0.45), @(-1.25,0.45)); width = 0.45 },
  @{ name = "east-mid-cross"; coords = @(@(0.87,0.20), @(1.85,0.20)); width = 0.45 },
  @{ name = "east-mid-from-wait"; coords = @(@(0.87,-0.29), @(0.87,0.20)); width = 0.45 },
  @{ name = "from-south-to-mid"; coords = @(@(0.87,-0.965), @(0.87,-0.29)); width = 0.45 }
)

function New-Edge($seg) {
  $body = @{
    geometry = @{ type = "LineString"; coordinates = $seg.coords }
    widthMeters = $seg.width
    direction = "ONE_WAY"
    capacity = 1
    maxSpeed = $null
    isActive = $true
  }
  $resp = Invoke-Json -Method POST -Uri "$base/api/navigation/maps/$mapId/edges" -Headers $h -Body $body
  Write-Host "EDGE $($resp.code) $($seg.name)"
  return $resp
}

foreach ($s in $ring) { New-Edge $s | Out-Null }
foreach ($s in $spurs) { New-Edge $s | Out-Null }

# --- 4) Snap endpoints onto ring / spur (names stable) ---
$eps = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/endpoints" -Headers $h
$poses = @{
  "Parking A" = @{ x = -1.929; y = -0.965; yaw = 0.0 }
  "Parking B" = @{ x = -1.479; y = -0.965; yaw = 0.0 }
  "CHARGER A" = @{ x = -1.029; y = -0.965; yaw = 0.0 }
  "Shelf-A-01" = @{ x = -1.25; y = 0.604; yaw = -1.5707963267948966 }  # lane goes north→south on shelfa-down
  "Shelf-A-02" = @{ x = -1.25; y = 0.953; yaw = -1.5707963267948966 }
  "Shelf-A-03" = @{ x = -1.25; y = 1.343; yaw = -1.5707963267948966 }
  "Shelf-A-04" = @{ x = -1.25; y = 1.62; yaw = -1.5707963267948966 }
  "Shelf-B-01" = @{ x = 0.85; y = 1.50; yaw = 1.5707963267948966 }
  "Shelf-B-02" = @{ x = 0.85; y = 1.35; yaw = -1.5707963267948966 }
  "Shelf-B-03" = @{ x = 0.85; y = 1.00; yaw = 1.5707963267948966 }
  "Shelf-B-04" = @{ x = 0.10; y = 1.35; yaw = -1.5707963267948966 }
  "Shelf-C-01" = @{ x = 0.80; y = -0.77; yaw = 1.5707963267948966 }
  "Shelf-C-02" = @{ x = 0.80; y = -0.965; yaw = 0.0 }
  "Inbound Area" = @{ x = 1.70; y = 1.62; yaw = 3.141592653589793 }
  "Outbound Area" = @{ x = 1.85; y = -1.00; yaw = 1.5707963267948966 }
  "Inspection Quality Area" = @{ x = 1.85; y = -0.90; yaw = 1.5707963267948966 }
  "Wait Point" = @{ x = 1.30; y = 0.85; yaw = 3.141592653589793 }
}

foreach ($ep in $eps) {
  if (-not $poses.ContainsKey($ep.name)) { Write-Host "SKIP $($ep.name)"; continue }
  $p = $poses[$ep.name]
  $body = @{
    name = $ep.name
    endpointType = $ep.endpointType
    x = $p.x; y = $p.y; yaw = $p.yaw
    positionTolerance = [double]$ep.positionTolerance
    yawTolerance = [double]$ep.yawTolerance
    isEnabled = [bool]$ep.isEnabled
  }
  Invoke-Json -Method PUT -Uri "$base/api/navigation/endpoints/$($ep.id)" -Headers $h -Body $body | Out-Null
  Write-Host "EP $($ep.name) -> ($($p.x),$($p.y))"
}

# --- 5) Add two small JUNCTION zones at ring corners (capacity 1) for labeled intersections ---
$junctions = @(
  @{ name = "J-SE"; poly = @(@(1.70,-1.10), @(2.00,-1.10), @(2.00,-0.80), @(1.70,-0.80), @(1.70,-1.10)) },
  @{ name = "J-NE"; poly = @(@(1.70,1.48), @(2.00,1.48), @(2.00,1.78), @(1.70,1.78), @(1.70,1.48)) },
  @{ name = "J-NW"; poly = @(@(-1.40,1.48), @(-1.10,1.48), @(-1.10,1.78), @(-1.40,1.78), @(-1.40,1.48)) },
  @{ name = "J-SW"; poly = @(@(-2.30,-1.10), @(-2.00,-1.10), @(-2.00,-0.80), @(-2.30,-0.80), @(-2.30,-1.10)) }
)
foreach ($j in $junctions) {
  $body = @{
    name = $j.name
    zoneType = "JUNCTION"
    geometry = @{ type = "Polygon"; coordinates = @(,$j.poly) }
    capacity = 1
    maxSpeed = $null
    isActive = $true
    policy = $null
    policySchemaVersion = $null
  }
  try {
    $resp = Invoke-Json -Method POST -Uri "$base/api/navigation/maps/$mapId/zones" -Headers $h -Body $body
    Write-Host "ZONE $($resp.code) $($j.name)"
  } catch {
    Write-Host "ZONE_FAIL $($j.name): $($_.Exception.Message)"
  }
}

# --- 6) Validate ---
$val = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h
$val | ConvertTo-Json -Depth 40 | Set-Content "$outDir\validation-ring.json"
$err = @($val.issues | Where-Object { $_.severity -eq 'Error' -or $_.Severity -eq 'Error' })
Write-Host "isValid=$($val.isValid) errorCount=$($err.Count) hash=$($val.graphHash)"
$err | Group-Object code | Sort-Object Count -Descending | ForEach-Object { Write-Host "$($_.Count) $($_.Name)" }
$err | Select-Object -First 30 | ForEach-Object { Write-Host "ERR $($_.code): $($_.message.Substring(0,[Math]::Min(140,$_.message.Length)))" }
