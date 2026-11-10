#!/usr/bin/env bash
# Bring up SIM-01 on MAP-ONE in the background.
#
# Extra launch args are forwarded, so the isolation run is:
#   bash _start_leave_sim.sh stage1_open_grant:=true
# That keeps the authority GATE on and only swaps the grant source, which separates Nav2
# geometry from the Semantic grant/renew path. Omit it for the authoritative run.
#
# wait_bringup.sh greps this log, and it only works because this script truncates it.
set +u
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
PIDF=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.pid
: >"$LOG"
nohup bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/launch_sim_map_one_dual.sh \
  gui:=false robots:=sim01 nav_start_delay:=40.0 gateway_extra_delay:=25.0 "$@" \
  >"$LOG" 2>&1 &
echo $! >"$PIDF"
echo "started pid=$(cat "$PIDF") args=[gui:=false robots:=sim01 nav_start_delay:=40.0 gateway_extra_delay:=25.0 $*]"
