#!/usr/bin/env bash
# Teleport sim01 back to Parking-A spawn (map frame ≈ world for MAP-ONE).
set +u
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
set -e
# Cancel any active nav.
ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{}" --feedback 2>/dev/null &
sleep 0.2
kill $! 2>/dev/null || true
# Gazebo set_pose (model name from spawn).
python3 - <<'PY'
import subprocess, time
# Prefer gz service if available
cmds = [
  ['gz', 'service', '-s', '/world/map_one_v001/set_pose', '--reqtype', 'gz.msgs.Pose', '--reptype', 'gz.msgs.Boolean', '--timeout', '2000',
   '--req', 'name: "warotrans_sim_01", position: {x: -1.743, y: -0.566, z: 0.05}, orientation: {z: -0.7071068, w: 0.7071068}'],
]
for c in cmds:
  try:
    r = subprocess.run(c, capture_output=True, text=True, timeout=5)
    print(r.stdout or r.stderr)
    if r.returncode == 0:
      break
  except Exception as e:
    print('set_pose failed', e)
time.sleep(1)
print('reset attempted')
PY
