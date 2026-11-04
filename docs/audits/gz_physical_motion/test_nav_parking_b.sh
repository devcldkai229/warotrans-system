#!/usr/bin/env bash
set +e
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
echo "## CM FootprintApproach enabled?"
timeout 5 ros2 param get /sim01/collision_monitor FootprintApproach.enabled 2>&1 | head -5
echo "## send Parking-B goal"
timeout 90 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose \
  "{pose: {header: {frame_id: map}, pose: {position: {x: -1.15, y: -0.525, z: 0.0}, orientation: {z: -0.707107, w: 0.707107}}}}" \
  | tee /mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/nav_parking_b_cm_off.txt
echo "## approach count since start of this test window (last 200 log lines)"
tail -200 "$LOG" | grep -c 'Robot to approach' || true
tail -200 "$LOG" | grep -c 'Failed to make progress' || true
grep -E 'SUCCEEDED|ABORTED|CANCELED|status:' /mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/nav_parking_b_cm_off.txt | tail -10
