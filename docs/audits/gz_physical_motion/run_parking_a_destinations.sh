#!/usr/bin/env bash
# Clean sim01 + Host-assumed Simulation :5090 → Parking-A destination tour.
set +e
AUD=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion
ROOT=/mnt/e/programming/my_project/warotrans/ros2_ws
source /opt/ros/jazzy/setup.bash
source "$ROOT/install/setup.bash"
# Kill prior probe only (pattern excludes this .sh wrapper).
while read -r pid; do kill -9 "$pid" 2>/dev/null; done < <(pgrep -f 'run_parking_a_destinations\.py' || true)
bash "$AUD/_kill_orphans.sh" >/dev/null 2>&1 || true
bash "$ROOT/scripts/kill_sim.sh" >/dev/null 2>&1 || true
sleep 3
bash "$AUD/start_gui_sim01.sh"
bash "$AUD/wait_bringup.sh" || exit 1
echo "=== settle 25s (HB MarkOnline + MQTT) ==="
sleep 25
# Require GT odom near Parking-A before goals.
python3 - <<'PY' || exit 5
import math, time
import rclpy
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.parameter import Parameter
rclpy.init()
n=Node("spawn_check", namespace="sim01", parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
       cli_args=["--ros-args","-r","/tf:=tf","-r","/tf_static:=tf_static"])
odom=[None]
n.create_subscription(Odometry,"odom",lambda m: odom.__setitem__(0,(m.pose.pose.position.x,m.pose.pose.position.y)),10)
t0=time.time()
while time.time()-t0<30 and odom[0] is None:
    rclpy.spin_once(n, timeout_sec=0.05)
if odom[0] is None:
    print("NO_ODOM_AT_SPAWN"); raise SystemExit(5)
err=math.hypot(odom[0][0]+1.743, odom[0][1]+0.516)
print(f"SPAWN_CHECK odom={odom[0]} err_to_parkingA={err:.3f}")
n.destroy_node(); rclpy.shutdown()
raise SystemExit(0 if err<=0.35 else 5)
PY
echo "=== destination tour ==="
python3 "$AUD/run_parking_a_destinations.py" | tee "$AUD/parking_a_destinations_console.txt"
exit ${PIPESTATUS[0]}
