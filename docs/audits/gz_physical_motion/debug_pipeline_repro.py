#!/usr/bin/env python3
"""Reproduce no-motion: NavigateToPose + sample cmd_vel stages + odom → debug-100d90.log."""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

import rclpy
from geometry_msgs.msg import Twist
from nav2_msgs.action import NavigateToPose
from nav_msgs.msg import Odometry
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import Bool

LOG = Path("/mnt/e/programming/my_project/warotrans-system/debug-100d90.log")


def dbg(hid: str, location: str, message: str, data: dict) -> None:
    # #region agent log
    try:
        line = json.dumps(
            {
                "sessionId": "100d90",
                "runId": "post-fix",
                "hypothesisId": hid,
                "location": location,
                "message": message,
                "data": data,
                "timestamp": int(time.time() * 1000),
            },
            ensure_ascii=True,
        )
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass
    # #endregion


class Probe(Node):
    def __init__(self) -> None:
        super().__init__(
            "debug_pipeline_repro",
            namespace="sim01",
            parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
            cli_args=["--ros-args", "-r", "/tf:=tf", "-r", "/tf_static:=tf_static"],
        )
        self.odom = None
        self.auth = None
        self.nav = (0.0, 0.0)
        self.smoothed = (0.0, 0.0)
        self.safe = (0.0, 0.0)
        self.gated = (0.0, 0.0)
        self.create_subscription(Odometry, "odom", self._od, 10)
        self.create_subscription(Bool, "traffic/authority_ok", self._au, 10)
        self.create_subscription(Twist, "cmd_vel_nav", lambda m: setattr(self, "nav", (m.linear.x, m.angular.z)), 10)
        self.create_subscription(
            Twist, "cmd_vel_smoothed", lambda m: setattr(self, "smoothed", (m.linear.x, m.angular.z)), 10
        )
        self.create_subscription(Twist, "cmd_vel_safe", lambda m: setattr(self, "safe", (m.linear.x, m.angular.z)), 10)
        self.create_subscription(Twist, "cmd_vel", lambda m: setattr(self, "gated", (m.linear.x, m.angular.z)), 10)
        self.ac = ActionClient(self, NavigateToPose, "navigate_to_pose")

    def _od(self, m: Odometry) -> None:
        self.odom = (m.pose.pose.position.x, m.pose.pose.position.y)

    def _au(self, m: Bool) -> None:
        self.auth = bool(m.data)


def main() -> int:
    rclpy.init()
    n = Probe()
    t0 = time.time()
    while time.time() - t0 < 20.0:
        rclpy.spin_once(n, timeout_sec=0.05)
        if n.odom is not None:
            break
    dbg("D", "debug_pipeline_repro.py:start", "probe_start", {"odom": n.odom, "auth": n.auth})
    print(f"START odom={n.odom} auth={n.auth}", flush=True)
    if not n.ac.wait_for_server(timeout_sec=30.0):
        dbg("A", "debug_pipeline_repro.py", "no_action_server", {})
        print("NO_SERVER", flush=True)
        return 1
    # Cold start: authority_ok stays False until first traffic_plan grant (after this goal's plan).
    # Do not wait for auth here — that deadlocks. Goal → plan → Host grant → gate open.
    g = NavigateToPose.Goal()
    g.pose.header.frame_id = "map"
    # EP-PARKING-B — short legal goal from Parking A
    g.pose.pose.position.x = -1.15
    g.pose.pose.position.y = -0.525
    yaw = -math.pi / 2
    g.pose.pose.orientation.z = math.sin(yaw / 2)
    g.pose.pose.orientation.w = math.cos(yaw / 2)
    send = n.ac.send_goal_async(g)
    while not send.done():
        rclpy.spin_once(n, timeout_sec=0.05)
    gh = send.result()
    if gh is None or not gh.accepted:
        dbg("A", "debug_pipeline_repro.py", "goal_rejected", {})
        print("REJECTED", flush=True)
        return 2
    dbg("A", "debug_pipeline_repro.py", "goal_accepted", {"goal": [-1.15, -0.525]})
    print("ACCEPTED", flush=True)
    o0 = n.odom
    rf = gh.get_result_async()
    t_end = time.time() + 50.0
    last = 0.0
    while time.time() < t_end and not rf.done():
        rclpy.spin_once(n, timeout_sec=0.05)
        now = time.time()
        if now - last >= 0.5:
            last = now
            nz = {
                "nav": abs(n.nav[0]) > 1e-3 or abs(n.nav[1]) > 1e-3,
                "smoothed": abs(n.smoothed[0]) > 1e-3 or abs(n.smoothed[1]) > 1e-3,
                "safe": abs(n.safe[0]) > 1e-3 or abs(n.safe[1]) > 1e-3,
                "gated": abs(n.gated[0]) > 1e-3 or abs(n.gated[1]) > 1e-3,
            }
            # Classify first-zero stage for hypotheses A/B/C
            hid = "A"
            if nz["nav"] and not nz["safe"]:
                hid = "B"
            elif nz["safe"] and not nz["gated"]:
                hid = "C"
            elif nz["gated"]:
                hid = "D"
            dbg(
                hid,
                "debug_pipeline_repro.py:sample",
                "pipeline_sample",
                {
                    "auth": n.auth,
                    "nav": list(n.nav),
                    "smoothed": list(n.smoothed),
                    "safe": list(n.safe),
                    "gated": list(n.gated),
                    "odom": list(n.odom) if n.odom else None,
                    "nz": nz,
                },
            )
    o1 = n.odom
    disp = None
    if o0 and o1:
        disp = math.hypot(o1[0] - o0[0], o1[1] - o0[1])
    status = "TIMEOUT"
    if rf.done():
        status = f"status_{int(rf.result().status)}"
    dbg(
        "D",
        "debug_pipeline_repro.py:end",
        "probe_end",
        {"status": status, "odom0": o0, "odom1": o1, "disp_m": disp},
    )
    print(f"END {status} disp={disp} odom0={o0} odom1={o1}", flush=True)
    n.destroy_node()
    rclpy.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
