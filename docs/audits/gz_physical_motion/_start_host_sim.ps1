$ErrorActionPreference = "Stop"
$proj = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host\WaroTrans.Host.csproj"
$log = "E:\programming\my_project\warotrans-system\docs\audits\gz_physical_motion\host_simulation.log"
# Kill existing Host on 5090 if any
Get-NetTCPConnection -LocalPort 5090 -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Get-Process WaroTrans.Host -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$env:ASPNETCORE_ENVIRONMENT = "Simulation"
Start-Process -FilePath "dotnet" -ArgumentList @("run","--project",$proj,"--launch-profile","Simulation","--no-build") -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden
Start-Sleep -Seconds 8
try {
  (Invoke-WebRequest -Uri "http://127.0.0.1:5090/health" -UseBasicParsing -TimeoutSec 5).Content
} catch {
  "health_fail: $_"
}
