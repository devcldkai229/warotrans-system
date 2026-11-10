#!/usr/bin/env python3
"""Parking-A → INBOUND: prove lane leave (not wall-hug), CM on, yaw at goal."""
from __future__ import annotations

import json
import math
import time
from pathlib import Path as FsPath

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from nav_msgs.msg import Odometry
from nav_msgs.msg import Path as NavPath
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import Bool

LOG = FsPath("/mnt/e/programming/my_project/warotrans-system/debug-100d90.log")
HOME = (-1.743, -0.516, -math.pi / 2)
GOAL = (1.747, 1.543, -math.pi / 2)  # EP-INBOUND
TOL_XY = 0.25
TOL_YAW = 0.45


def dbg(msg: str, data: dict) -> None:
    # #region agent log
    try:
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "sessionId": "100d90",
                        "runId": "lane-cm",
                        "hypothesisId": "LANE",
                        "location": "verify_lane_cm_inbound.py",
                        "message": msg,
                        "data": data,
                        "timestamp": int(time.time() * 1000),
                    }
                )
                + "\n"
            )
    except Exception:
        pass
    # #endregion


def yaw_of(o: Odometry) -> float:
    q = o.pose.pose.orientation
    return math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z))


def ang_err(a: float, b: float) -> float:
    d = (a - b + math.pi) % (2 * math.pi) - math.pi
    return abs(d)


class Verifier(Node):
    def __init__(self) -> None:
        super().__init__(
            "verify_lane_cm_inbound",
            namespace="sim01",
            parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
            cli_args=["--ros-args", "-r", "/tf:=tf", "-r", "/tf_static:=tf_static"],
        )
        self.odom: Odometry | None = None
        self.auth: bool | None = None
        self.plan_pts: list[tuple[float, float]] = []
        self.trace: list[tuple[float, float]] = []
        self.create_subscription(Odometry, "odom", self._od, 10)
        self.create_subscription(Bool, "traffic/authority_ok", lambda m: setattr(self, "auth", bool(m.data)), 10)
        self.create_subscription(NavPath, "plan", self._plan, 10)
        self.ac = ActionClient(self, NavigateToPose, "navigate_to_pose")

    def _od(self, m: Odometry) -> None:
        self.odom = m
        self.trace.append((m.pose.pose.position.x, m.pose.pose.position.y))

    def _plan(self, m: NavPath) -> None:
        if not m.poses:
            return
        self.plan_pts = [(p.pose.position.x, p.pose.position.y) for p in m.poses]


def main() -> int:
    rclpy.init()
    n = Verifier()
    t0 = time.time()
    while time.time() - t0 < 30 and n.odom is None:
        rclpy.spin_once(n, timeout_sec=0.05)
    if n.odom is None:
        print("NO_ODOM")
        return 1
    if not n.ac.wait_for_server(timeout_sec=60.0):
        print("NO_SERVER")
        return 2

    ox = n.odom.pose.pose.position.x
    oy = n.odom.pose.pose.position.y
    dbg("start", {"odom": [ox, oy], "auth": n.auth})
    print(f"START odom=({ox:.3f},{oy:.3f}) auth={n.auth}", flush=True)

    g = NavigateToPose.Goal()
    g.pose = PoseStamped()
    g.pose.header.frame_id = "map"
    g.pose.header.stamp = n.get_clock().now().to_msg()
    g.pose.pose.position.x = GOAL[0]
    g.pose.pose.position.y = GOAL[1]
    g.pose.pose.orientation.z = math.sin(GOAL[2] / 2)
    g.pose.pose.orientation.w = math.cos(GOAL[2] / 2)
    send = n.ac.send_goal_async(g)
    while not send.done():
        rclpy.spin_once(n, timeout_sec=0.05)
    gh = send.result()
    if gh is None or not gh.accepted:
        print("REJECTED")
        return 3

    rf = gh.get_result_async()
    t_end = time.time() + 240.0
    while time.time() < t_end and not rf.done():
        rclpy.spin_once(n, timeout_sec=0.05)

    status = "TIMEOUT" if not rf.done() else f"status_{int(rf.result().status)}"
    assert n.odom is not None
    x = n.odom.pose.pose.position.x
    y = n.odom.pose.pose.position.y
    yaw = yaw_of(n.odom)
    err_xy = math.hypot(x - GOAL[0], y - GOAL[1])
    err_yaw = ang_err(yaw, GOAL[2])

    # Proxy: after leaving parking, first 1.0 m of travel should gain |x| (east into lane)
    # rather than hug south wall (y decreasing hard while x barely grows).
    leave_ok = False
    if len(n.trace) >= 5:
        for px, py in n.trace:
            if math.hypot(px - HOME[0], py - HOME[1]) >= 0.6:
                # Prefer having moved into open X corridor (x > -1.2) before deep Y wall clip
                leave_ok = px > -1.35
                break

    # Plan should not stay glued at y≈-0.9 along wall for first segment
    plan_wall_hug = False
    if len(n.plan_pts) >= 4:
        early = n.plan_pts[: min(12, len(n.plan_pts))]
        plan_wall_hug = sum(1 for _, py in early if py < -0.85) >= 6

    ok = (
        status == "status_4"
        and err_xy <= TOL_XY
        and err_yaw <= TOL_YAW
        and leave_ok
        and not plan_wall_hug
    )
    result = {
        "status": status,
        "err_xy": err_xy,
        "err_yaw": err_yaw,
        "odom": [x, y, yaw],
        "goal": list(GOAL),
        "leave_ok": leave_ok,
        "plan_wall_hug": plan_wall_hug,
        "n_plan": len(n.plan_pts),
        "n_trace": len(n.trace),
        "auth_end": n.auth,
        "pass": ok,
        "cm": "FootprintApproach_tbc_0.10",
        "yaw_tol": TOL_YAW,
    }
    dbg("end", result)
    print(json.dumps(result, indent=2), flush=True)
    print(f"PASS={ok}", flush=True)
    n.destroy_node()
    rclpy.shutdown()
    return 0 if ok else 4


if __name__ == "__main__":
    raise SystemExit(main())
