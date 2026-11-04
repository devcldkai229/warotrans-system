$ErrorActionPreference = "Continue"
Get-Process WaroTrans.Host -ErrorAction SilentlyContinue | Stop-Process -Force
Get-NetTCPConnection -LocalPort 5090 -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
$projDir = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host"
dotnet build "$projDir\WaroTrans.Host.csproj" -nologo -v q
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD_FAIL"; exit 1 }
$env:ASPNETCORE_ENVIRONMENT = "Simulation"
$p = Start-Process -FilePath "dotnet" `
  -ArgumentList @("run","--project","$projDir\WaroTrans.Host.csproj","--launch-profile","Simulation","--no-build") `
  -WorkingDirectory $projDir `
  -PassThru `
  -WindowStyle Minimized
Write-Host "started host pid=$($p.Id)"
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  try {
    $h = (Invoke-WebRequest -Uri "http://127.0.0.1:5090/health" -UseBasicParsing -TimeoutSec 2).Content
    Write-Host "health=$h t=$($i*2)s"
    exit 0
  } catch {}
}
Write-Host "health_timeout"
exit 1
