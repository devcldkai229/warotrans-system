$ErrorActionPreference = "Stop"
$env:WAROTRANS_PG_CONTAINER = "warotrans-postgres-5434"
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:Mqtt__Host = "127.0.0.1"
$env:ConnectionStrings__PostgreSQL = "Host=127.0.0.1;Port=5434;Database=warotrans;Username=warotrans;Password=warotrans"
$env:MapAssetStorage__Provider = "Local"
$env:Traffic__Mode = "Active"

Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" |
  Where-Object { $_.CommandLine -like "*WaroTrans.Host*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$proj = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host\WaroTrans.Host.csproj"
$wd = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host"
Start-Process -FilePath "dotnet" -ArgumentList @("run","--no-build","--launch-profile","http","--project",$proj) `
  -WorkingDirectory $wd -WindowStyle Hidden

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try {
    $login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
      -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
    $ok = $true
    break
  } catch { }
}
if (-not $ok) { throw "Host did not become ready" }

$h = @{ Authorization = "Bearer $($login.accessToken)" }
$r = (Invoke-RestMethod "http://127.0.0.1:5090/api/fleet/robots" -Headers $h).items |
  Where-Object { $_.code -eq "RBT-SIM-01" }
Write-Host "robot online=$($r.isOnline) loc=$($r.localizationStatus) pose=($($r.poseX),$($r.poseY))"

# If still quarantined from boot race, operator-reconcile with current pose.
$snap = Invoke-RestMethod "http://127.0.0.1:5090/api/fleet/traffic/snapshot" -Headers $h
$rob = @($snap.robots)[0]
Write-Host "pre phase=$($rob.phase) locOk=$($rob.localizationOk) q=$($rob.quarantineReason)"
if ($rob.phase -eq "Quarantined" -or -not $rob.localizationOk) {
  $body = @{ PoseX = [double]$r.poseX; PoseY = [double]$r.poseY; LocalizationOk = $true } | ConvertTo-Json
  $rec = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/fleet/traffic/robots/$($r.id)/reconcile" `
    -Headers $h -ContentType "application/json" -Body $body
  Write-Host "reconcile ok=$($rec.ok) reason=$($rec.reason)"
}

$run = $args[0]
if (-not $run) { $run = "1" }
$outDir = "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-run-$run"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
& powershell -ExecutionPolicy Bypass -File "E:\programming\my_project\warotrans-system\samples\simulation\run-job-sim.ps1" `
  -Scenario inbound -ConfirmDelaySeconds 2 -TimeoutSeconds 700 `
  2>&1 | Tee-Object -FilePath (Join-Path $outDir "console.log")

Copy-Item "E:\programming\my_project\warotrans-system\samples\simulation\responses\11-job.final.json" (Join-Path $outDir "job.json") -Force
Copy-Item "E:\programming\my_project\warotrans-system\samples\simulation\responses\12-job.transport-request.final.json" (Join-Path $outDir "tr.json") -Force
$snap2 = Invoke-RestMethod "http://127.0.0.1:5090/api/fleet/traffic/snapshot" -Headers $h
$snap2 | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $outDir "traffic-snapshot.json")
