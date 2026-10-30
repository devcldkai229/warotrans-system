$ErrorActionPreference = "Stop"
Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" |
  Where-Object { $_.CommandLine -like "*WaroTrans.Host*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:Mqtt__Host = "127.0.0.1"
$env:ConnectionStrings__PostgreSQL = "Host=127.0.0.1;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans"
$env:MapAssetStorage__Provider = "Local"
$env:Traffic__Mode = "Active"

$proj = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host\WaroTrans.Host.csproj"
$wd = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host"
Start-Process -FilePath "dotnet" -ArgumentList @("run","--project",$proj,"--launch-profile","http") `
  -WorkingDirectory $wd -WindowStyle Hidden

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  try {
    $login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
      -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
    $ok = $true
    break
  } catch { }
}
if (-not $ok) { throw "Host did not become ready" }
Write-Host "HOST_OK token_len=$($login.accessToken.Length)"
