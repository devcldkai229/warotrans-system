$ErrorActionPreference = "Stop"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$robotId = "1a9cfd7b-0417-4f65-8271-3ef780bc0cac"

docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE navigation.map_versions SET status='DRAFT' WHERE id='$mapId';"
$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$eps = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/endpoints" -Headers $h

# Place parks/charger on south corridor (EDGE-353) with collision-monitor buffer.
$poses = @{
  "EP-PARK-5" = @{ x = -1.929; y = -0.965 }
  "EP-PARK-6" = @{ x = -1.479; y = -0.965 }
  "EP-CHARGER-7" = @{ x = -1.029; y = -0.965 }
}
foreach ($e in $eps) {
  if (-not $poses.ContainsKey($e.code)) { continue }
  $p = $poses[$e.code]
  $body = @{
    name=$e.name; endpointType=$e.endpointType; x=$p.x; y=$p.y; yaw=$e.yaw
    positionTolerance=$e.positionTolerance; yawTolerance=$e.yawTolerance; isEnabled=$e.isEnabled
  } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method PUT -Uri "http://127.0.0.1:5090/api/navigation/endpoints/$($e.id)" -Headers $h -ContentType "application/json" -Body $body | Out-Null
  Write-Host "MOVED $($e.code) -> ($($p.x), $($p.y))"
}

$rg = Invoke-WebRequest -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h -UseBasicParsing
$rg.Content | Set-Content "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001\route-graph.geojson" -Encoding UTF8
Write-Host "routeHash=$($rg.Headers['X-Route-Graph-Hash'])"
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/publish" -Headers $h | Out-Null

wsl -e bash -lc "cd /mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation && python3 scripts/sync_web_map.py --user admin --password 'Admin@123' --backend http://127.0.0.1:5090"
powershell -ExecutionPolicy Bypass -File "E:\programming\my_project\warotrans-system\docs\traffic-hardening\_seed_wh42.ps1"
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE fleet.robots SET status='AVAILABLE', updated_at=now() WHERE id='$robotId';"
wsl -e bash -lc "bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/_restart_sim_clean.sh"
