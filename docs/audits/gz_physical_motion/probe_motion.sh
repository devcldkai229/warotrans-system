#!/usr/bin/env bash
set +e
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
export ROS_LOCALHOST_ONLY=1
echo "## topics"
timeout 5 ros2 topic list 2>/dev/null | grep sim01 | head -40
echo "## auth hz"
timeout 3 ros2 topic hz /sim01/traffic/authority_ok 2>&1 | head -8
echo "## auth once"
timeout 3 ros2 topic echo /sim01/traffic/authority_ok --once 2>&1 | head -15
echo "## cmd_vel_nav once"
timeout 3 ros2 topic echo /sim01/cmd_vel_nav --once 2>&1 | head -20
echo "## cmd_vel_safe once"
timeout 3 ros2 topic echo /sim01/cmd_vel_safe --once 2>&1 | head -20
echo "## cmd_vel once"
timeout 3 ros2 topic echo /sim01/cmd_vel --once 2>&1 | head -20
echo "## odom once"
timeout 3 ros2 topic echo /sim01/odom --once 2>&1 | head -25
echo "## action servers"
timeout 5 ros2 action list 2>/dev/null | grep -i nav
