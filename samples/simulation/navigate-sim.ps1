<#
.SYNOPSIS
  GĐ 2 — Backend điều khiển robot ảo: gửi NAVIGATE_TO_POSE tới một endpoint qua API Fleet và theo dõi tới khi xong.

.DESCRIPTION
  POST /api/fleet/robots/{id}/commands/navigate   (backend → MQTT command → gateway → Nav2 → Gazebo)
  rồi đọc GET /api/fleet/robots/{id} mỗi giây (pose, navigationStatus do telemetry cập nhật),
  cuối cùng đọc trạng thái lệnh trong fleet.robot_commands (ACK/RESULT do gateway trả về).

  Cần: seed-sim.ps1 đã chạy (sim-config.json), backend đang chạy, robot ảo đang chạy:
    wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File samples/simulation/navigate-sim.ps1 -To A
  powershell -ExecutionPolicy Bypass -File samples/simulation/navigate-sim.ps1 -To IN1,C,OUT1,PARK
#>
param(
    [string[]]$To = @("A"),
    [string]$BaseUrl = "http://localhost:5090",
    [int]$TimeoutSeconds = 180,
    [int]$WaitOnlineSeconds = 90
)

$script:BaseUrl = $BaseUrl
. (Join-Path $PSScriptRoot "sim-common.ps1")
# "-File ... -To D,A" arrives as one string: split on commas.
$To = @($To | ForEach-Object { $_ -split ',' } | Where-Object { $_ })

$config = (Read-Text (Join-Path $PSScriptRoot "sim-config.json")) | ConvertFrom-Json
$token = Get-AdminToken
$robotPath = "/api/fleet/robots/$($config.robotId)"

# ---------------------------------------------------------------- robot must be online + localized
Write-Host "Waiting for $($config.robotCode) online + LOCALIZED (heartbeat/telemetry via MQTT)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds($WaitOnlineSeconds)
do {
    $robot = (Invoke-Api GET $robotPath $null $token).Body
    if ($robot.isOnline -and $robot.localizationStatus -eq "LOCALIZED") { break }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not ($robot.isOnline -and $robot.localizationStatus -eq "LOCALIZED")) {
    throw "Robot not ready: isOnline=$($robot.isOnline) localization=$($robot.localizationStatus). Is run-sim.sh running?"
}
Write-Host ("  online, LOCALIZED at ({0:N2}, {1:N2}) map={2}" -f $robot.poseX, $robot.poseY, $robot.mapVersionCode) -ForegroundColor Green

$log = New-Object System.Collections.Generic.List[string]
foreach ($alias in $To) {
    $ep = $config.endpoints | Where-Object { $_.alias -eq $alias } | Select-Object -First 1
    if ($null -eq $ep) { throw "Unknown endpoint alias '$alias' (sim-config.json)" }

    Write-Host ""
    Write-Host ("-> {0} ({1}) at ({2}, {3}, yaw {4})" -f $alias, $ep.code, $ep.x, $ep.y, $ep.yaw) -ForegroundColor Cyan
    $body = @{ x = $ep.x; y = $ep.y; yaw = $ep.yaw; frameId = "map" } | ConvertTo-Json -Compress
    $issued = Invoke-Api POST "$robotPath/commands/navigate" $body $token
    Assert-Status $issued 202 "POST navigate"
    $commandId = $issued.Body.commandId
    $start = Get-Date

    # Telemetry keeps the robot snapshot fresh; the command row is updated by ACK / RESULT.
    $status = $null
    do {
        Start-Sleep -Seconds 1
        $robot = (Invoke-Api GET $robotPath $null $token).Body
        $row = Invoke-Psql "SELECT status || '|' || coalesce(outcome,'') || '|' || coalesce(error_code, reject_reason_code, '') FROM fleet.robot_commands WHERE id = '$commandId';"
        $status = $row.Split('|')
        Write-Host ("  t={0,3}s  pose=({1,5:N2},{2,5:N2})  nav={3,-10} command={4}" -f `
            [int]((Get-Date) - $start).TotalSeconds, $robot.poseX, $robot.poseY, $robot.navigationStatus, $status[0])
    } while ($status[0] -notin @("COMPLETED", "FAILED", "CANCELED", "REJECTED", "TIMEOUT", "ABORTED") -and ((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds)

    $line = "{0} {1}: command {2} status={3} outcome={4} error={5} in {6}s, final pose=({7:N2}, {8:N2})" -f `
        $alias, $ep.code, $commandId, $status[0], $status[1], $status[2], [int]((Get-Date) - $start).TotalSeconds, $robot.poseX, $robot.poseY
    $log.Add($line)
    Write-Host "  $line" -ForegroundColor $(if ($status[0] -eq "COMPLETED" -and $status[1] -eq "SUCCEEDED") { "Green" } else { "Yellow" })
}

Save-Text "03-navigate.result.txt" (($log -join "`n") + "`n")
