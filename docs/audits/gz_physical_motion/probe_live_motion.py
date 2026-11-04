#!/usr/bin/env python3
import math
import time

import rclpy
from geometry_msgs.msg import Twist
from nav2_msgs.action import NavigateToPose
from nav_msgs.msg import Odometry
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import Bool


class P(Node):
    def __init__(self):
        super().__init__(
            "probe_live",
            namespace="sim01",
            parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
            cli_args=["--ros-args", "-r", "/tf:=tf", "-r", "/tf_static:=tf_static"],
        )
        self.odom = None
        self.auth = None
        self.nav = (0.0, 0.0)
        self.safe = (0.0, 0.0)
        self.gated = (0.0, 0.0)
        self.create_subscription(Odometry, "odom", self._od, 10)
        self.create_subscription(Bool, "traffic/authority_ok", self._au, 10)
        self.create_subscription(Twist, "cmd_vel_nav", lambda m: self._tw("nav", m), 10)
        self.create_subscription(Twist, "cmd_vel_safe", lambda m: self._tw("safe", m), 10)
        self.create_subscription(Twist, "cmd_vel", lambda m: self._tw("gated", m), 10)
        self.ac = ActionClient(self, NavigateToPose, "navigate_to_pose")

    def _od(self, m):
        self.odom = (m.pose.pose.position.x, m.pose.pose.position.y)

    def _au(self, m):
        self.auth = m.data

    def _tw(self, k, m):
        setattr(self, k, (m.linear.x, m.angular.z))


def main():
    rclpy.init()
    n = P()
    t0 = time.time()
    while time.time() - t0 < 15:
        rclpy.spin_once(n, timeout_sec=0.05)
        if n.odom is not None:
            break
    print(f"start odom={n.odom} auth={n.auth}", flush=True)
    if not n.ac.wait_for_server(timeout_sec=20.0):
        print("NO_SERVER")
        return 1
    g = NavigateToPose.Goal()
    g.pose.header.frame_id = "map"
    g.pose.pose.position.x = -1.15
    g.pose.pose.position.y = -0.525
    yaw = -math.pi / 2
    g.pose.pose.orientation.z = math.sin(yaw / 2)
    g.pose.pose.orientation.w = math.cos(yaw / 2)
    fut = n.ac.send_goal_async(g)
    while not fut.done():
        rclpy.spin_once(n, timeout_sec=0.05)
    gh = fut.result()
    if not gh.accepted:
        print("REJECTED")
        return 2
    print("ACCEPTED", flush=True)
    o0 = n.odom
    samples = []
    t_end = time.time() + 45.0
    rf = gh.get_result_async()
    while time.time() < t_end and not rf.done():
        rclpy.spin_once(n, timeout_sec=0.05)
        samples.append((n.auth, n.nav, n.safe, n.gated, n.odom))
        time.sleep(0.2)
    o1 = n.odom
    auth_t = sum(1 for s in samples if s[0] is True)
    auth_f = sum(1 for s in samples if s[0] is False)
    nav_nz = sum(1 for s in samples if abs(s[1][0]) > 1e-3 or abs(s[1][1]) > 1e-3)
    safe_nz = sum(1 for s in samples if abs(s[2][0]) > 1e-3 or abs(s[2][1]) > 1e-3)
    gated_nz = sum(1 for s in samples if abs(s[3][0]) > 1e-3 or abs(s[3][1]) > 1e-3)
    disp = None
    if o0 and o1:
        disp = math.hypot(o1[0] - o0[0], o1[1] - o0[1])
    status = "TIMEOUT"
    if rf.done():
        status = f"status={rf.result().status}"
    print(
        f"end status={status} odom0={o0} odom1={o1} disp={disp} "
        f"auth_t/f={auth_t}/{auth_f} nz nav/safe/gated={nav_nz}/{safe_nz}/{gated_nz}",
        flush=True,
    )
    n.destroy_node()
    rclpy.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
