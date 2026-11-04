#!/usr/bin/env bash
set +e
set +u
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
set -u
ROOT=/mnt/e/programming/my_project/warotrans/ros2_ws
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
PIDF=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.pid
bash "$ROOT/scripts/kill_sim.sh" >/dev/null 2>&1 || true
sleep 2
: >"$LOG"
nohup bash "$ROOT/scripts/launch_sim_map_one_dual.sh" \
  gui:=true robots:=sim01 nav_start_delay:=40.0 gateway_extra_delay:=25.0 \
  >"$LOG" 2>&1 &
echo $! >"$PIDF"
echo "started pid=$(cat "$PIDF") log=$LOG"
