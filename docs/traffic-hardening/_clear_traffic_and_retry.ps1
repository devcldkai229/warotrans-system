$ErrorActionPreference = "Stop"
$robotId = "1a9cfd7b-0417-4f65-8271-3ef780bc0cac"

# Restart Host so SegmentedTrafficCoordinator drops any stale in-memory graph holds.
powershell -ExecutionPolicy Bypass -File "E:\programming\my_project\warotrans-system\docs\traffic-hardening\_restart_host_local.ps1"

$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# Reconcile robot on V001 pose (corridor park)
$rec = '{"poseX":-1.929,"poseY":-0.965,"localizationOk":true,"occupiedEdgeIds":[]}'
try {
  $r = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/fleet/traffic/robots/$robotId/reconcile" -Headers $h -ContentType "application/json" -Body $rec
  Write-Host "reconcile OK $($r | ConvertTo-Json -Compress)"
} catch {
  Write-Host "reconcile resp: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $sr.ReadToEnd()
  }
}

docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE fleet.robots SET status='AVAILABLE', updated_at=now() WHERE id='$robotId';"

# Snapshot traffic
try {
  $snap = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/fleet/traffic/snapshot" -Headers $h
  $snap | ConvertTo-Json -Depth 8 | Set-Content "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-wh42-v001\traffic-after-host-restart.json" -Encoding UTF8
  Write-Host "traffic snapshot written"
} catch {
  Write-Host "no traffic snapshot endpoint or error: $($_.Exception.Message)"
}

Write-Host "HOST_TRAFFIC_CLEARED"
