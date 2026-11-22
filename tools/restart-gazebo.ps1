# Restarts the Gazebo simulation (WSL Ubuntu-24.04, ROS 2 Jazzy) with RBT-001 on MAP-ONE-V013.
# Usage (PowerShell, from anywhere):
#   .\tools\restart-gazebo.ps1                          # GUI on, spawn at Parking A
#   .\tools\restart-gazebo.ps1 -Spawn EP-INBOUND        # spawn somewhere else
#   .\tools\restart-gazebo.ps1 -Headless                # no Gazebo window
#   .\tools\restart-gazebo.ps1 -StopOnly                # just stop it
# The launch runs in this window; Ctrl+C stops it. Log is also written to $env:TEMP\gazebo.log.
param(
    [string]$Spawn = 'EP-PARKING-A',
    [string]$RobotCode = 'RBT-001',
    [switch]$Headless,
    [switch]$StopOnly
)

$distro = 'Ubuntu-24.04'

Write-Host '== Stopping Gazebo / ROS 2 / Nav2 ...'
wsl -d $distro -- bash -c "pkill -9 -f 'gz sim'; pkill -9 -f 'ros2 launch'; pkill -9 -f warotrans_simulation; pkill -9 -f nav2; pkill -9 -f robot_gateway; true"
Start-Sleep -Seconds 2
$left = wsl -d $distro -- bash -c "ps -eo cmd | grep -E 'gz sim|ros2 launch|nav2|warotrans' | grep -v grep | wc -l"
Write-Host "   processes left: $left"
if ($StopOnly) { return }

$gui = if ($Headless) { 'false' } else { 'true' }
$share = '/home/waro/warotrans_ws/install/warotrans_simulation/share/warotrans_simulation'
$launch = @(
    'source /opt/ros/jazzy/setup.bash',
    'source /home/waro/warotrans_ws/install/setup.bash',
    ("ros2 launch warotrans_simulation multi_sim_map_one.launch.py robots:=sim01 gui:=$gui " +
     "sim01_robot_code:=$RobotCode sim01_spawn_endpoint:=$Spawn nav_start_delay:=15.0 gateway_extra_delay:=25.0 " +
     "layout:=$share/config/layouts/map_one_v013.yaml map:=$share/maps/map_one_v013/map.yaml world:=$share/worlds/map_one_v013.sdf")
) -join ' && '

$log = Join-Path $env:TEMP 'gazebo.log'
Write-Host "== Starting Gazebo: $RobotCode at $Spawn (gui=$gui). Robot reaches the backend after ~40-60 s."
Write-Host "   Log: $log"
wsl -d $distro -- bash -lc $launch 2>&1 | Tee-Object -FilePath $log
