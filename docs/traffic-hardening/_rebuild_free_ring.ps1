# Rebuild edges on V003 using occupancy-cleared corridors (>= ~0.23 m).
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:5090"
$mapId = (Get-Content "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-ONEWAY\draft_map_id.txt" -Raw).Trim()
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-ONEWAY"

function Invoke-Json {
  param($Method, $Uri, $Headers, $Body)
  $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers; ContentType = "application/json" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 30 -Compress) }
  return Invoke-RestMethod @params
}

$login = Invoke-RestMethod -Method POST -Uri "$base/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$edges = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/edges" -Headers $h
foreach ($e in $edges) {
  Invoke-RestMethod -Method DELETE -Uri "$base/api/navigation/edges/$($e.id)" -Headers $h | Out-Null
  Write-Host "DEL $($e.code)"
}

# Strongly connected ONE_WAY cycle on free corridors (see PGM clearance analysis).
$segs = @(
  @{ name = "south-eb"; coords = @(@(-2.30,-0.95), @(-0.30,-0.95)); width = 0.50 },
  @{ name = "center-nb"; coords = @(@(-0.30,-0.95), @(-0.30,0.10)); width = 0.50 },
  @{ name = "mid-eb"; coords = @(@(-0.30,0.10), @(1.70,0.10)); width = 0.50 },
  @{ name = "east-nb"; coords = @(@(1.70,0.10), @(1.70,1.55)); width = 0.50 },
  @{ name = "ne-cross"; coords = @(@(1.70,1.55), @(1.80,1.55)); width = 0.45 },
  @{ name = "east-sb"; coords = @(@(1.80,1.55), @(1.80,-0.30)); width = 0.50 },
  @{ name = "low-wb"; coords = @(@(1.80,-0.30), @(-0.10,-0.30)); width = 0.50 },
  @{ name = "center-sb"; coords = @(@(-0.10,-0.30), @(-0.10,-1.00)); width = 0.50 },
  @{ name = "south-wb"; coords = @(@(-0.10,-1.00), @(-2.30,-1.00)); width = 0.50 },
  @{ name = "sw-cross"; coords = @(@(-2.30,-1.00), @(-2.30,-0.95)); width = 0.45 },
  # Shelf-A / north service on center NB (x=-0.30 free to ~1.56)
  @{ name = "center-nb-high"; coords = @(@(-0.30,0.10), @(-0.30,1.50)); width = 0.50 },
  # Wait spur from east SB (x=1.8 free); keep spur short inside free band
  @{ name = "wait-w"; coords = @(@(1.80,0.50), @(1.55,0.50)); width = 0.40 },
  @{ name = "wait-s"; coords = @(@(1.55,0.50), @(1.55,0.20)); width = 0.40 },
  @{ name = "wait-e"; coords = @(@(1.55,0.20), @(1.80,0.20)); width = 0.40 },
  # Shelf-C on south-eb
  @{ name = "shelfc-mark"; coords = @(@(-0.60,-0.95), @(-0.60,-0.80)); width = 0.40 },
  @{ name = "shelfc-back"; coords = @(@(-0.60,-0.80), @(-0.30,-0.80)); width = 0.40 },
  @{ name = "shelfc-down"; coords = @(@(-0.30,-0.80), @(-0.30,-0.95)); width = 0.40 }
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
}

foreach ($s in $segs) { New-Edge $s }

# Endpoints onto free lanes (Shelf-A on center x=-0.30 — aisle x=-1.25 lacks 0.23 m clearance)
$poses = @{
  "Parking A" = @{ x = -1.929; y = -0.95; yaw = 0.0 }
  "Parking B" = @{ x = -1.479; y = -0.95; yaw = 0.0 }
  "CHARGER A" = @{ x = -1.029; y = -0.95; yaw = 0.0 }
  "Shelf-A-01" = @{ x = -0.30; y = 0.60; yaw = 1.5707963267948966 }
  "Shelf-A-02" = @{ x = -0.30; y = 0.95; yaw = 1.5707963267948966 }
  "Shelf-A-03" = @{ x = -0.30; y = 1.30; yaw = 1.5707963267948966 }
  "Shelf-A-04" = @{ x = -0.30; y = 1.50; yaw = 0.0 }
  "Shelf-B-01" = @{ x = 1.70; y = 1.45; yaw = 1.5707963267948966 }
  "Shelf-B-02" = @{ x = 1.70; y = 1.25; yaw = 1.5707963267948966 }
  "Shelf-B-03" = @{ x = 1.70; y = 1.05; yaw = 1.5707963267948966 }
  "Shelf-B-04" = @{ x = 1.70; y = 0.85; yaw = 1.5707963267948966 }
  "Shelf-C-01" = @{ x = -0.60; y = -0.80; yaw = 1.5707963267948966 }
  "Shelf-C-02" = @{ x = -0.80; y = -0.95; yaw = 0.0 }
  "Inbound Area" = @{ x = 1.70; y = 1.55; yaw = 0.0 }
  "Outbound Area" = @{ x = 1.80; y = -0.20; yaw = -1.5707963267948966 }
  "Inspection Quality Area" = @{ x = 1.80; y = 0.0; yaw = -1.5707963267948966 }
  "Wait Point" = @{ x = 1.55; y = 0.50; yaw = 3.141592653589793 }
}

$eps = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/endpoints" -Headers $h
foreach ($ep in $eps) {
  if (-not $poses.ContainsKey($ep.name)) { continue }
  $p = $poses[$ep.name]
  $body = @{
    name = $ep.name; endpointType = $ep.endpointType
    x = $p.x; y = $p.y; yaw = $p.yaw
    positionTolerance = [double]$ep.positionTolerance
    yawTolerance = [double]$ep.yawTolerance
    isEnabled = [bool]$ep.isEnabled
  }
  Invoke-Json -Method PUT -Uri "$base/api/navigation/endpoints/$($ep.id)" -Headers $h -Body $body | Out-Null
  Write-Host "EP $($ep.name) ($($p.x),$($p.y))"
}

$val = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h
$val | ConvertTo-Json -Depth 40 | Set-Content "$outDir\validation-free-ring.json" -Encoding utf8
$err = @($val.issues | Where-Object { $_.severity -eq 'Error' })
Write-Host "isValid=$($val.isValid) errors=$($err.Count) hash=$($val.graphHash)"
$err | Group-Object code | Sort-Object Count -Descending | ForEach-Object { Write-Host "$($_.Count) $($_.Name)" }
$err | ForEach-Object { Write-Host "ERR $($_.code) [$($_.relatedCodes -join ',')] $($_.message)" }
