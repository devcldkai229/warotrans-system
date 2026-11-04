#!/usr/bin/env bash
set +u
python3 -c 'import json; json.load(open("/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/maps/map_one_v001/lanes.json")); print("lanes ok")'
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
set -e
timeout 40 bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/launch_sim_map_one_dual.sh \
  gui:=false robots:=sim01 nav_start_delay:=5.0 gateway_extra_delay:=5.0 \
  2>&1 | tee /tmp/leave_smoke_launch.log | tail -50
echo EXIT=$?
