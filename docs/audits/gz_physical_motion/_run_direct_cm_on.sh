#!/usr/bin/env bash
set +u
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
set -e
ros2 daemon stop >/dev/null 2>&1 || true
ros2 daemon start >/dev/null 2>&1 || true
sleep 2
export CM_MODE=on
cd /mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion
# set -e would abort before EXIT is printed; the code carries meaning:
#   0 pass | 1 no odom/action server | 3 CM_MODE disagrees with the live node | 4 fail
set +e
python3 verify_direct_inbound.py
rc=$?
set -e
echo "EXIT=$rc"
exit $rc
