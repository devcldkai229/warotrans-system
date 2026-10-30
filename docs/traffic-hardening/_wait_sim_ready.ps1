$ErrorActionPreference = "Continue"
$log = "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\logs\sim_active.log"
$launcher = "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\logs\launcher.out"
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 5
  $ready = $false
  if (Test-Path $log) {
    $tail = Get-Content $log -Tail 80 -ErrorAction SilentlyContinue
    $text = $tail -join "`n"
    if ($text -match "robot_gateway" -and ($text -match "authority" -or $text -match "Heartbeat" -or $text -match "telemetry")) {
      $ready = $true
    }
    if ($text -match "ERROR|Traceback|failed to") {
      Write-Host "---- log issues ----"
      $tail | Select-String -Pattern "ERROR|Traceback|failed|route graph|MAP-WH|spawn|graphHash" | Select-Object -Last 20
    }
  }
  # Also probe fleet robot online
  try {
    $login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
    $h = @{ Authorization = "Bearer $($login.accessToken)" }
    $r = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:5090/api/fleet/robots/1a9cfd7b-0417-4f65-8271-3ef780bc0cac" -Headers $h
    Write-Host ("t={0}s online={1} map={2} pose=({3:N3},{4:N3},{5:N3}) nav={6}" -f ($i*5), $r.isOnline, $r.mapVersionCode, $r.poseX, $r.poseY, $r.poseYaw, $r.navigationStatus)
    if ($r.isOnline -and $r.mapVersionCode -eq "MAP-WH42CFE65F-V001") {
      Write-Host "SIM_READY"
      # dump pose evidence
      $out = "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-wh42-v001"
      New-Item -ItemType Directory -Force -Path $out | Out-Null
      $r | ConvertTo-Json -Depth 6 | Set-Content "$out\pose-telemetry.json" -Encoding UTF8
      exit 0
    }
  } catch {
    Write-Host ("t={0}s robot_probe_fail {1}" -f ($i*5), $_.Exception.Message)
  }
}
Write-Host "SIM_NOT_READY"
Write-Host "---- launcher.out ----"
if (Test-Path $launcher) { Get-Content $launcher -Tail 40 }
Write-Host "---- sim_active.log ----"
if (Test-Path $log) { Get-Content $log -Tail 60 }
exit 1
