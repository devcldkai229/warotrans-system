$ErrorActionPreference = "Stop"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"

docker exec warotrans-postgres psql -U warotrans -d warotrans -c `
  "UPDATE navigation.map_versions SET status='DRAFT' WHERE id='$mapId';"

$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$eps = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/endpoints" -Headers $h
$nudge = @{
  "EP-PARK-5" = @{ x = -1.932; y = -0.595 }
  "EP-PARK-6" = @{ x = -1.455; y = -0.595 }
  "EP-CHARGER-7" = @{ x = -1.019; y = -0.595 }
}
foreach ($e in $eps) {
  if (-not $nudge.ContainsKey($e.code)) { continue }
  $body = @{
    name = $e.name
    endpointType = $e.endpointType
    x = $nudge[$e.code].x
    y = $nudge[$e.code].y
    yaw = $e.yaw
    positionTolerance = $e.positionTolerance
    yawTolerance = $e.yawTolerance
    isEnabled = $e.isEnabled
  } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method PUT -Uri "http://127.0.0.1:5090/api/navigation/endpoints/$($e.id)" `
    -Headers $h -ContentType "application/json" -Body $body | Out-Null
  Write-Host "NUDGED $($e.code) -> ($($nudge[$e.code].x), $($nudge[$e.code].y))"
}

# topology check via route-graph
try {
  $r = Invoke-WebRequest -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h -UseBasicParsing
  Write-Host "ROUTE_GRAPH_OK len=$($r.Content.Length) hash=$($r.Headers['X-Route-Graph-Hash'])"
  $r.Content | Set-Content "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001\route-graph.geojson" -Encoding UTF8
} catch {
  $resp = $_.Exception.Response
  $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
  Write-Host "ROUTE_GRAPH_FAIL $($sr.ReadToEnd().Substring(0,1500))"
  exit 2
}

Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/publish" -Headers $h | Out-Null
Write-Host "PUBLISHED"

# refresh sim overlay + world (spawn pose in sim_endpoints)
wsl -e bash -lc "cd /mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation && python3 scripts/sync_web_map.py --user admin --password 'Admin@123' --backend http://127.0.0.1:5090"
wsl -e bash -lc "python3 /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/_find_clear_park.py" | Select-Object -Last 10

# refresh sim-config park coords
powershell -ExecutionPolicy Bypass -File "E:\programming\my_project\warotrans-system\docs\traffic-hardening\_seed_wh42.ps1"
