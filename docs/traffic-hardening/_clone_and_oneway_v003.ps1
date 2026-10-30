# Clone MAP-WH42CFE65F-V001 → DRAFT, convert all edges to ONE_WAY with a
# clockwise outer loop + through aisles (no dead-end traps), then validate.
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:5090"
$srcId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-ONEWAY"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Invoke-Json {
  param($Method, $Uri, $Headers, $Body)
  $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers; ContentType = "application/json" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 30 -Compress) }
  return Invoke-RestMethod @params
}

$login = Invoke-RestMethod -Method POST -Uri "$base/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 1) Clone
$clone = Invoke-Json -Method POST -Uri "$base/api/navigation/maps/$srcId/clone" -Headers $h `
  -Body @{ name = "WH42 ONE_WAY draft from V001" }
$mapId = $clone.id
$code = $clone.code
Write-Host "CLONED $code id=$mapId"
$mapId | Set-Content "$outDir\draft_map_id.txt"
$code | Set-Content "$outDir\draft_map_code.txt"
$clone | ConvertTo-Json -Depth 6 | Set-Content "$outDir\clone.json"

# 2) Dump edges / endpoints (API)
$edges = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/edges" -Headers $h
$eps = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/endpoints" -Headers $h
# Fallback: list via map get
$map = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId" -Headers $h
if (-not $edges) { $edges = $map.edges }
if (-not $eps) { $eps = $map.endpoints }
$edges | ConvertTo-Json -Depth 20 | Set-Content "$outDir\edges-before.json"
$eps | ConvertTo-Json -Depth 10 | Set-Content "$outDir\endpoints-before.json"
Write-Host "edges=$($edges.Count) endpoints=$($eps.Count)"

# Helper: identify edge by approximate geometry (source codes change on clone)
function Edge-Key($e) {
  $c = $e.geometry.coordinates
  $a = $c[0]; $b = $c[$c.Count - 1]
  return ("{0:0.00},{1:0.00}->{2:0.00},{3:0.00}" -f [double]$a[0],[double]$a[1],[double]$b[0],[double]$b[1])
}

# Desired ONE_WAY orientations (start → end). Keys match Edge-Key of V001 snapshot geometry.
# Clockwise outer: south E, east N, north W, west connectors S; aisles through.
$desired = @{
  # EDGE-353 south park corridor: west → east
  "-2.18,-0.99->-0.69,-0.99" = @{ coords = @(@(-2.179,-0.99), @(-0.69,-0.99)); flip = $false }
  # EDGE-355 south east: west → east
  "-0.40,-0.99->1.80,-0.99" = @{ coords = @(@(-0.40,-0.99), @(1.80,-0.99)); flip = $false }
  # EDGE-356 east vertical: south → north
  "1.80,-0.99->1.80,1.70" = @{ coords = @(@(1.80,-0.99), @(1.80,1.70)); flip = $false }
  # EDGE-357 north cross: east → west
  "0.10,1.50->1.80,1.50" = @{ coords = @(@(1.80,1.50), @(0.10,1.50)); flip = $true }
  # EDGE-354 riser: south → north (into mid)
  "-0.40,-0.99->-0.40,-0.35" = @{ coords = @(@(-0.40,-0.99), @(-0.40,-0.35)); flip = $false }
  # EDGE-352 mid west: east → west (into west aisle)
  "-0.69,0.05->-2.17,0.05" = @{ coords = @(@(-0.685,0.05), @(-2.173,0.05)); flip = $false }
  # EDGE-359 shelf-A vertical: south → north (through)
  "-1.25,0.05->-1.25,1.70" = @{ coords = @(@(-1.25,0.05), @(-1.25,1.70)); flip = $false }
  # EDGE-349 west-of-center vertical: south → north
  "0.10,0.45->0.10,1.34" = @{ coords = @(@(0.102,0.45), @(0.095,1.336)); flip = $false }
  # EDGE-350: north → south (return toward mid)
  "-0.42,1.34->-0.41,0.44" = @{ coords = @(@(-0.419,1.338), @(-0.408,0.436)); flip = $false }
  # EDGE-348 mid east: east → west
  "1.48,0.20->0.87,0.20" = @{ coords = @(@(1.48,0.2), @(0.868,0.2)); flip = $false }
  # EDGE-347: west → east toward wait/east
  "0.87,-0.29->1.49,-0.29" = @{ coords = @(@(0.871,-0.291), @(1.491,-0.291)); flip = $false }
  # EDGE-360 shelf-B spur: west → east then need exit — extend later if trap
  "0.10,1.35->0.85,1.35" = @{ coords = @(@(0.10,1.35), @(0.85,1.35)); flip = $false }
  # EDGE-361 shelf-C spur: south → north onto spur then need return path
  "0.80,-0.99->0.80,-0.75" = @{ coords = @(@(0.80,-0.99), @(0.80,-0.75)); flip = $false }
  # EDGE-362 wait spur: south → north
  "1.30,0.20->1.30,0.85" = @{ coords = @(@(1.30,0.2), @(1.30,0.85)); flip = $false }
}

function Match-Desired($e) {
  $c = $e.geometry.coordinates
  $a = @([double]$c[0][0], [double]$c[0][1])
  $b = @([double]$c[$c.Count-1][0], [double]$c[$c.Count-1][1])
  foreach ($k in $desired.Keys) {
    $parts = $k -split '->'
    $s = $parts[0] -split ','; $t = $parts[1] -split ','
    $sx = [double]$s[0]; $sy = [double]$s[1]; $tx = [double]$t[0]; $ty = [double]$t[1]
    $tol = 0.08
    $fwd = ([Math]::Abs($a[0]-$sx) -lt $tol -and [Math]::Abs($a[1]-$sy) -lt $tol -and [Math]::Abs($b[0]-$tx) -lt $tol -and [Math]::Abs($b[1]-$ty) -lt $tol)
    $rev = ([Math]::Abs($a[0]-$tx) -lt $tol -and [Math]::Abs($a[1]-$ty) -lt $tol -and [Math]::Abs($b[0]-$sx) -lt $tol -and [Math]::Abs($b[1]-$sy) -lt $tol)
    if ($fwd -or $rev) { return $desired[$k] }
  }
  return $null
}

foreach ($e in $edges) {
  $d = Match-Desired $e
  $coords = @()
  foreach ($c in $e.geometry.coordinates) { $coords += , @([double]$c[0], [double]$c[1]) }
  if ($null -ne $d) {
    if ($d.flip) {
      [array]::Reverse($coords)
    }
    # Prefer explicit desired coords when provided (normalized)
    if ($d.coords) {
      $coords = $d.coords
      if ($d.flip -and -not $d.coords) { } # already handled
      # If flip was used to mark direction and coords are already start→end, use as-is
      if ($d.flip) {
        # desired.coords already in travel order for flipped keys
        $coords = $d.coords
      }
    }
  }
  $body = @{
    geometry = @{ type = "LineString"; coordinates = $coords }
    widthMeters = [double]$e.widthMeters
    direction = "ONE_WAY"
    capacity = [int]$e.capacity
    maxSpeed = $e.maxSpeed
    isActive = [bool]$e.isActive
  }
  Invoke-Json -Method PUT -Uri "$base/api/navigation/edges/$($e.id)" -Headers $h -Body $body | Out-Null
  Write-Host "ONE_WAY $($e.code) $($coords[0][0]),$($coords[0][1]) -> $($coords[$coords.Count-1][0]),$($coords[$coords.Count-1][1])"
}

# 3) Add return connectors for former dead-end spurs (ONE_WAY exits)
# Shelf-C: from spur tip back to south lane eastbound continuation (east of spur)
# Wait: from tip east to EDGE-356
# Shelf-B: from tip north to EDGE-357
$newEdges = @(
  @{ name = "shelfC-exit-east"; coords = @(@(0.80,-0.75), @(1.80,-0.75)); width = 0.45 },
  @{ name = "shelfC-exit-down"; coords = @(@(1.80,-0.75), @(1.80,-0.99)); width = 0.45 },
  @{ name = "wait-exit-east"; coords = @(@(1.30,0.85), @(1.80,0.85)); width = 0.45 },
  @{ name = "shelfB-exit-north"; coords = @(@(0.85,1.35), @(0.85,1.50)); width = 0.45 },
  @{ name = "shelfA-north-to-mid"; coords = @(@(-1.25,1.70), @(-0.42,1.70)); width = 0.45 },
  @{ name = "shelfA-north-down"; coords = @(@(-0.42,1.70), @(-0.42,1.338)); width = 0.45 },
  @{ name = "west-down-to-park"; coords = @(@(-2.173,0.05), @(-2.179,-0.99)); width = 0.55 },
  @{ name = "mid-link-354-352"; coords = @(@(-0.40,-0.35), @(-0.685,0.05)); width = 0.50 },
  @{ name = "north-to-349"; coords = @(@(0.10,1.50), @(0.10,1.336)); width = 0.45 }
)

foreach ($ne in $newEdges) {
  $body = @{
    geometry = @{ type = "LineString"; coordinates = $ne.coords }
    widthMeters = $ne.width
    direction = "ONE_WAY"
    capacity = 1
    maxSpeed = $null
    isActive = $true
  }
  $resp = Invoke-Json -Method POST -Uri "$base/api/navigation/maps/$mapId/edges" -Headers $h -Body $body
  Write-Host "CREATED $($resp.code) ($($ne.name))"
}

# 4) Align endpoint yaw with travel direction where helpful (park facing east along south)
foreach ($ep in $eps) {
  $name = $ep.name
  $yaw = [double]$ep.yaw
  $x = [double]$ep.x; $y = [double]$ep.y
  # Parking/Charger on south corridor traveling east → yaw 0
  if ($name -match 'Parking|CHARGER') { $yaw = 0.0 }
  # Shelf-A on vertical northbound → yaw +pi/2
  if ($name -match 'Shelf-A') { $yaw = 1.5707963267948966 }
  # Shelf-C on spur northbound → +pi/2
  if ($name -match 'Shelf-C-01') { $yaw = 1.5707963267948966 }
  # Inbound near north/east → face west along north lane
  if ($name -eq 'Inbound Area') { $yaw = 3.141592653589793 }
  $body = @{
    name = $ep.name
    endpointType = $ep.endpointType
    x = $x; y = $y; yaw = $yaw
    positionTolerance = [double]$ep.positionTolerance
    yawTolerance = [double]$ep.yawTolerance
    isEnabled = [bool]$ep.isEnabled
  }
  Invoke-Json -Method PUT -Uri "$base/api/navigation/endpoints/$($ep.id)" -Headers $h -Body $body | Out-Null
  Write-Host "EP $($ep.code) $name yaw=$yaw"
}

# 5) Validate
$val = Invoke-RestMethod -Uri "$base/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h
$val | ConvertTo-Json -Depth 30 | Set-Content "$outDir\validation.json"
$errors = @($val.issues | Where-Object { $_.severity -eq 'Error' -or $_.Severity -eq 'Error' })
Write-Host "isValid=$($val.isValid) errors=$($errors.Count) hash=$($val.graphHash)"
$errors | ForEach-Object { Write-Host "ERR $($_.code) $($_.message)" }

Write-Host "DONE mapId=$mapId code=$code"
