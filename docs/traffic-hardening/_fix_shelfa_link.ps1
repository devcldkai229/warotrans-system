$ErrorActionPreference = "Stop"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001"

$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Extend shelfA vertical down onto EDGE-352 (y=0.05)
$edge359 = "191a92fc-4c19-40a3-8a89-c8946e2ef096"
$body359 = @{
  geometry = @{ type = "LineString"; coordinates = @(@(-1.25, 0.05), @(-1.25, 1.70)) }
  widthMeters = 0.45
  direction = "BIDIRECTIONAL"
  capacity = 1
  maxSpeed = $null
  isActive = $true
}
Invoke-RestMethod -Method PUT -Uri "http://127.0.0.1:5090/api/navigation/edges/$edge359" `
  -Headers $h -ContentType "application/json" -Body ($body359 | ConvertTo-Json -Depth 10 -Compress) | Out-Null
Write-Host "EDGE-359 extended onto EDGE-352"

# Delete orphan connector EDGE-358 (optional but cleaner)
$edge358 = "41bd214a-490e-45e9-9253-bbc215650f02"
try {
  Invoke-RestMethod -Method DELETE -Uri "http://127.0.0.1:5090/api/navigation/edges/$edge358" -Headers $h | Out-Null
  Write-Host "EDGE-358 deleted"
} catch {
  Write-Host "EDGE-358 delete skipped: $($_.Exception.Message)"
}

# Also ensure wait spur connects: EDGE-362 from (1.30,0.20) - EDGE-348 is at y=0.2 from 1.48 to 0.868, so (1.30,0.20) is ON it. Good.

$val = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h
$val | ConvertTo-Json -Depth 20 | Set-Content "$outDir\validation-after-shelfa.json" -Encoding UTF8
$topo = @($val.issues | Where-Object {
  $_.severity -eq "ERROR" -and (
    $_.code -like "ENDPOINT_*" -or $_.code -like "GRAPH_*" -or $_.code -like "DEAD_*" -or $_.code -like "LANE_*"
  )
})
$allErr = @($val.issues | Where-Object { $_.severity -eq "ERROR" })
Write-Host "isValid=$($val.isValid) allErrors=$($allErr.Count) topoErrors=$($topo.Count) hash=$($val.graphHash)"
$topo | ForEach-Object { Write-Host "TOPO [$($_.code)] $($_.message)" }

# Route-graph export (topology only)
try {
  $r2 = Invoke-WebRequest -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h -UseBasicParsing
  $r2.Content | Set-Content "$outDir\route-graph.geojson" -Encoding UTF8
  $gh = $r2.Headers["X-Route-Graph-Hash"]
  if (-not $gh) {
    $j = $r2.Content | ConvertFrom-Json
    $gh = $j.properties.graphHash
  }
  Write-Host "ROUTE_GRAPH_OK hash=$gh len=$($r2.Content.Length)"
} catch {
  $resp = $_.Exception.Response
  $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
  $body = $sr.ReadToEnd()
  $body | Set-Content "$outDir\route-graph-error.json" -Encoding UTF8
  Write-Host "ROUTE_GRAPH_FAIL"
  Write-Host $body.Substring(0, [Math]::Min(2500, $body.Length))
  exit 3
}

if ($topo.Count -gt 0) {
  Write-Host "TOPOLOGY_STILL_INVALID"
  exit 2
}

# Publish
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/publish" -Headers $h | Out-Null
$st = docker exec warotrans-postgres psql -U warotrans -d warotrans -t -A -c "SELECT status FROM navigation.map_versions WHERE id='$mapId';"
Write-Host "PUBLISHED status=$st"

@"
mapId=$mapId
code=MAP-WH42CFE65F-V001
warehouse=WH-42CFE65F
validationIsValid=$($val.isValid)
validationGraphHash=$($val.graphHash)
runtimeRouteGraphHash=$gh
topoErrors=$($topo.Count)
allValidationErrors=$($allErr.Count)
note=Clearance/stopline/safe-stop may remain; route-graph topology export OK after shelfA link
exportedAt=$(Get-Date -Format o)
"@ | Set-Content "$outDir\EXPORT_META.txt" -Encoding UTF8
Write-Host "DONE"
