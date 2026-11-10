#!/usr/bin/env bash
set +e
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
echo "approach=$(grep -c 'Robot to approach' "$LOG" || true)"
echo "progress=$(grep -c 'Failed to make progress' "$LOG" || true)"
echo "blocking=$(grep -c 'BLOCKING' "$LOG" || true)"
echo "--- gate/auth ---"
grep -E 'BLOCKING|authority_ok|cmd_vel_authority|OPEN|grant' "$LOG" | tail -30
echo "--- last approach ---"
grep 'Robot to approach' "$LOG" | tail -5
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
# dump CM params (best effort)
timeout 8 ros2 param dump /sim01/collision_monitor 2>/dev/null | head -80 || echo param_dump_fail
