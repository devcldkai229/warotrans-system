$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$job = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/workflow-execution/jobs/d04c82ac-6974-4a01-a35f-55cc7d35a4e0" -Headers $h
foreach ($t in $job.tasks) {
  foreach ($s in $t.steps) {
    Write-Host ("[{0}] {1} status={2} err={3} msg={4}" -f $s.sequenceNo, $s.stepKey, $s.status, $s.errorCode, $s.errorMessage)
  }
}
# Also peek traffic snapshot for map hash
try {
  $snap = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/fleet/traffic/snapshot" -Headers $h
  Write-Host "SNAP map=$($snap.mapVersionCode) hash=$($snap.graphHash) robots=$($snap.robots.Count)"
  $snap | ConvertTo-Json -Depth 6 | Set-Content "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-wh42-v001\traffic-snap-job4.json" -Encoding UTF8
} catch { Write-Host "snap fail $($_.Exception.Message)" }
