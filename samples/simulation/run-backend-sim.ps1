<#
.SYNOPSIS
  Chạy backend (Development, :5090) cho mô phỏng Gazebo.

.DESCRIPTION
  Ép MQTT dùng IPv4 127.0.0.1 thay cho "localhost".
  Lý do: trên máy dev (WSL2 mirrored + Docker Desktop), "localhost" phân giải ra ::1 trước, mà Mosquitto
  không nhận kết nối IPv6. Kết nối đầu tiên treo ~21 s, nên lệnh robot đầu tiên tới trễ hơn ACK timeout (10 s)
  và bị đánh TIMEOUT. Không sửa appsettings.json chung của team. Chỉ override bằng biến môi trường.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File samples/simulation/run-backend-sim.ps1
#>
$env:Mqtt__Host = "127.0.0.1"
$env:ConnectionStrings__PostgreSQL = "Host=127.0.0.1;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
dotnet run --project (Join-Path $repo "backend\src\WaroTrans.Host") --launch-profile http
