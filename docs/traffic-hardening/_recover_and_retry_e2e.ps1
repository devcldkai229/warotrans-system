$ErrorActionPreference = "Stop"
$robotId = "1a9cfd7b-0417-4f65-8271-3ef780bc0cac"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"

# 1) Nudge park further south (clearer) and republish if needed
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE navigation.map_versions SET status='DRAFT' WHERE id='$mapId';"
$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$eps = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/endpoints" -Headers $h
foreach ($e in $eps) {
  if ($e.code -notin @("EP-PARK-5","EP-PARK-6","EP-CHARGER-7")) { continue }
  $y = -0.70
  $body = @{
    name=$e.name; endpointType=$e.endpointType; x=$e.x; y=$y; yaw=$e.yaw
    positionTolerance=$e.positionTolerance; yawTolerance=$e.yawTolerance; isEnabled=$e.isEnabled
  } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method PUT -Uri "http://127.0.0.1:5090/api/navigation/endpoints/$($e.id)" -Headers $h -ContentType "application/json" -Body $body | Out-Null
  Write-Host "NUDGED $($e.code) y=$y"
}
# ensure route still exports
$rg = Invoke-WebRequest -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h -UseBasicParsing
Write-Host "route-graph OK $($rg.Headers['X-Route-Graph-Hash'])"
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/publish" -Headers $h | Out-Null

wsl -e bash -lc "cd /mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation && python3 scripts/sync_web_map.py --user admin --password 'Admin@123' --backend http://127.0.0.1:5090"

# 2) Reset robot AVAILABLE + clear FAULT via reconcile
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE fleet.robots SET status='AVAILABLE', updated_at=now() WHERE id='$robotId';"
$recBody = '{"poseX":-1.932,"poseY":-0.70,"localizationOk":true,"occupiedEdgeIds":[]}'
try {
  Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/fleet/traffic/robots/$robotId/reconcile" -Headers $h -ContentType "application/json" -Body $recBody | ConvertTo-Json -Depth 5 | Write-Host
} catch {
  Write-Host "reconcile: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $sr.ReadToEnd()
  }
}

# 3) Restart sim so spawn uses new park y
wsl -e bash -lc "bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/_restart_sim_clean.sh"
