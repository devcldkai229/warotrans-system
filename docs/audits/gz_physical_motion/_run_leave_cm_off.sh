#!/usr/bin/env bash
set +u
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
set -e
# Stale ros2 daemon after relaunch causes NO_ODOM_OR_SERVER under WSL.
ros2 daemon stop >/dev/null 2>&1 || true
ros2 daemon start >/dev/null 2>&1 || true
sleep 2
export CM_MODE=off
cd /mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion
python3 verify_parking_leave_inbound.py
echo "EXIT=$?"
