#!/usr/bin/env python3
"""Direct Parking-A → EP-INBOUND: single NavigateToPose only (no forced hops).

CM_MODE from env (off|on). Logs GT /sim01/odom, plan, auth, cmd_vel pipeline.
"""
from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path as FsPath

import rclpy
from geometry_msgs.msg import PoseStamped, Twist
from nav2_msgs.action import NavigateToPose
from nav_msgs.msg import Odometry
from nav_msgs.msg import Path as NavPath
from rcl_interfaces.srv import GetParameters
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import Bool

import _clearance

SESSION_ID = os.environ.get("WT_SESSION_ID", "100d90")
LOG = FsPath(
    os.environ.get(
        "WT_DEBUG_LOG",
        f"/mnt/e/programming/my_project/warotrans-system/debug-{SESSION_ID}.log",
    )
)
GOAL = (1.747, 1.543, -math.pi / 2)  # EP-INBOUND
HOME = (-1.743, -0.516)
# Acceptance thresholds from the handoff DoD. The goal checker's own tolerances are
# read off the live controller_server instead of copied here, so they cannot drift.
DOD_TOL_XY = 0.20
DOD_TOL_YAW = 0.40
CM_MODE = os.environ.get("CM_MODE", "unknown")
RUN_ID = f"direct-{CM_MODE}"


def dbg(msg: str, data: dict, hypothesis_id: str = "DIRECT") -> None:
    # #region agent log
    try:
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "sessionId": SESSION_ID,
                        "runId": RUN_ID,
                        "hypothesisId": hypothesis_id,
                        "location": "verify_direct_inbound.py",
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
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


def pose(x: float, y: float, yaw: float, node: Node) -> PoseStamped:
    p = PoseStamped()
    p.header.frame_id = "map"
    p.header.stamp = node.get_clock().now().to_msg()
    p.pose.position.x = x
    p.pose.position.y = y
    p.pose.orientation.z = math.sin(yaw / 2)
    p.pose.orientation.w = math.cos(yaw / 2)
    return p


class Verifier(Node):
    def read_params(self, node_name: str, names: list[str], timeout_s: float = 20.0) -> dict:
        """Read parameters off a running node (the ros2 param CLI hangs on a stale daemon)."""
        cli = self.create_client(GetParameters, f"{node_name}/get_parameters")
        if not cli.wait_for_service(timeout_sec=timeout_s):
            return {}
        fut = cli.call_async(GetParameters.Request(names=names))
        t_end = time.time() + timeout_s
        while time.time() < t_end and not fut.done():
            rclpy.spin_once(self, timeout_sec=0.05)
        res = fut.result()
        if res is None:
            return {}
        out: dict = {}
        for name, val in zip(names, res.values):
            # rcl_interfaces ParameterType: 1 BOOL, 2 INT, 3 DOUBLE, 4 STRING
            if val.type == 1:
                out[name] = val.bool_value
            elif val.type == 2:
                out[name] = val.integer_value
            elif val.type == 3:
                out[name] = val.double_value
            elif val.type == 4:
                out[name] = val.string_value
        return out

    def __init__(self) -> None:
        super().__init__(
            "verify_direct_inbound",
            namespace="sim01",
            parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
            cli_args=["--ros-args", "-r", "/tf:=tf", "-r", "/tf_static:=tf_static"],
        )
        self.odom: Odometry | None = None
        self.auth: bool | None = None
        self.trace: list[tuple[float, float, float]] = []
        self.plan_pts: list[tuple[float, float]] = []
        self.cmd_nav = 0
        self.cmd_safe = 0
        self.cmd_out = 0
        self.cmd_nav_last: dict | None = None
        self.cmd_safe_last: dict | None = None
        self.cmd_out_last: dict | None = None
        self.create_subscription(Odometry, "odom", self._od, 10)
        self.create_subscription(Bool, "traffic/authority_ok", lambda m: setattr(self, "auth", bool(m.data)), 10)
        self.create_subscription(NavPath, "plan", self._plan, 10)
        self.create_subscription(Twist, "cmd_vel_nav", self._nav, 10)
        self.create_subscription(Twist, "cmd_vel_safe", self._safe, 10)
        self.create_subscription(Twist, "cmd_vel", self._out, 10)
        self.ac = ActionClient(self, NavigateToPose, "navigate_to_pose")

    def _od(self, m: Odometry) -> None:
        self.odom = m
        self.trace.append((m.pose.pose.position.x, m.pose.pose.position.y, yaw_of(m)))

    def _plan(self, m: NavPath) -> None:
        if m.poses:
            self.plan_pts = [(p.pose.position.x, p.pose.position.y) for p in m.poses]

    def _nav(self, m: Twist) -> None:
        self.cmd_nav += 1
        self.cmd_nav_last = {"vx": m.linear.x, "wz": m.angular.z}

    def _safe(self, m: Twist) -> None:
        self.cmd_safe += 1
        self.cmd_safe_last = {"vx": m.linear.x, "wz": m.angular.z}

    def _out(self, m: Twist) -> None:
        self.cmd_out += 1
        self.cmd_out_last = {"vx": m.linear.x, "wz": m.angular.z}

    def go(self, timeout_s: float) -> str:
        goal = NavigateToPose.Goal()
        goal.pose = pose(*GOAL, self)
        dbg("send_goal", {"target": list(GOAL), "cm": CM_MODE}, "DIRECT")
        send = self.ac.send_goal_async(goal)
        while not send.done():
            rclpy.spin_once(self, timeout_sec=0.05)
        gh = send.result()
        if gh is None or not gh.accepted:
            dbg("rejected", {"cm": CM_MODE}, "DIRECT")
            return "REJECTED"
        rf = gh.get_result_async()
        t_end = time.time() + timeout_s
        last_log = 0.0
        while time.time() < t_end and not rf.done():
            rclpy.spin_once(self, timeout_sec=0.05)
            now = time.time()
            if now - last_log >= 2.0 and self.odom is not None:
                last_log = now
                ox = self.odom.pose.pose.position.x
                oy = self.odom.pose.pose.position.y
                cm_block = False
                if self.cmd_nav_last and self.cmd_safe_last:
                    if abs(self.cmd_nav_last["vx"]) > 0.05 and abs(self.cmd_safe_last["vx"]) < 0.02:
                        cm_block = True
                dbg(
                    "progress",
                    {
                        "t": round(now - (t_end - timeout_s), 1),
                        "xy": [round(ox, 3), round(oy, 3)],
                        "yaw": round(yaw_of(self.odom), 3),
                        "auth": self.auth,
                        "plan_n": len(self.plan_pts),
                        "plan_min_y": min((p[1] for p in self.plan_pts), default=None),
                        "plan_max_x": max((p[0] for p in self.plan_pts), default=None),
                        "plan_head": self.plan_pts[:3],
                        "cmd_nav": self.cmd_nav_last,
                        "cmd_safe": self.cmd_safe_last,
                        "cmd_out": self.cmd_out_last,
                        "cm_block": cm_block,
                    },
                    "DIRECT",
                )
        if not rf.done():
            gh.cancel_goal_async()
            return "TIMEOUT"
        return f"status_{int(rf.result().status)}"


def trajectory_quality(trace: list[tuple[float, float, float]]) -> dict:
    west_keepout = False
    min_y = None
    max_x = None
    for px, py, _ in trace:
        if px < -2.15:
            west_keepout = True
        min_y = py if min_y is None else min(min_y, py)
        max_x = px if max_x is None else max(max_x, px)
    # Coarse ONE_WAY heuristic: reverse travel on known eastbound LTR-C (y≈-0.327, x increasing only).
    oneway_reverse = False
    prev = None
    for px, py, _ in trace:
        if abs(py + 0.327) < 0.12 and 0.7 < px < 1.65:
            if prev is not None and px < prev - 0.05:
                oneway_reverse = True
            prev = px
        else:
            prev = None
    # Measured clearance, not a hand-drawn box: dipping to y ~ -0.99 is the SAFE line
    # through the pillar gap (0.30 m), while y ~ -0.84 is the 0.150 m squeeze CM held on.
    clear = _clearance.shared()
    return {
        "trace_clearance": clear.profile([(x, y) for x, y, _ in trace]),
        "west_keepout": west_keepout,
        "oneway_reverse_ltr_c": oneway_reverse,
        "trace_min_y": min_y,
        "trace_max_x": max_x,
        "n_trace": len(trace),
        "sample": [[round(x, 3), round(y, 3)] for x, y, _ in trace[:: max(1, len(trace) // 20)][:20]],
    }


def main() -> int:
    rclpy.init()
    n = Verifier()
    t0 = time.time()
    while time.time() - t0 < 30 and n.odom is None:
        rclpy.spin_once(n, timeout_sec=0.05)
    if n.odom is None or not n.ac.wait_for_server(timeout_sec=60.0):
        print("NO_ODOM_OR_SERVER")
        return 1

    live_ctrl = n.read_params(
        "controller_server",
        [
            "general_goal_checker.xy_goal_tolerance",
            "general_goal_checker.yaw_goal_tolerance",
            "FollowPath.use_rotate_to_heading",
            "FollowPath.rotate_to_heading_min_angle",
            "FollowPath.allow_reversing",
            "FollowPath.use_collision_detection",
        ],
    )
    live_cm = n.read_params(
        "collision_monitor",
        ["FootprintApproach.enabled", "FootprintApproach.time_before_collision"],
    )
    live_infl = n.read_params(
        "global_costmap/global_costmap", ["inflation_layer.inflation_radius"]
    )

    nav_tol_xy = live_ctrl.get("general_goal_checker.xy_goal_tolerance", DOD_TOL_XY)
    nav_tol_yaw = live_ctrl.get("general_goal_checker.yaw_goal_tolerance", DOD_TOL_YAW)

    # CM_MODE used to be a bare log label: the real A/B switch is FootprintApproach.enabled
    # in nav2_params_sim.yaml, which must be rebuilt and relaunched by hand. A run labelled
    # direct-on against a CM-off build produced evidence that quietly said the opposite.
    cm_enabled = live_cm.get("FootprintApproach.enabled")
    cm_mismatch = None
    if cm_enabled is not None and CM_MODE in ("on", "off"):
        if cm_enabled is not (CM_MODE == "on"):
            cm_mismatch = f"CM_MODE={CM_MODE} but FootprintApproach.enabled={cm_enabled}"

    print(
        f"START direct cm={CM_MODE} odom=({n.odom.pose.pose.position.x:.3f},{n.odom.pose.pose.position.y:.3f})",
        flush=True,
    )
    dbg(
        "start",
        {
            "cm": CM_MODE,
            "odom": [n.odom.pose.pose.position.x, n.odom.pose.pose.position.y],
            "nav_tol_xy": nav_tol_xy,
            "nav_tol_yaw": nav_tol_yaw,
            "dod_tol_xy": DOD_TOL_XY,
            "dod_tol_yaw": DOD_TOL_YAW,
            "live_controller": live_ctrl,
            "live_collision_monitor": live_cm,
            "live_inflation": live_infl,
            "cm_mismatch": cm_mismatch,
            "clearance_half_width": _clearance.HALF_WIDTH_M,
            "clearance_circumscribed": round(_clearance.CIRCUMSCRIBED_M, 4),
            "goal": list(GOAL),
            "forced_hops": False,
        },
        "DIRECT",
    )

    if cm_mismatch:
        print(f"ABORT {cm_mismatch} - rebuild and relaunch before labelling this run", flush=True)
        dbg("abort", {"reason": cm_mismatch}, "DIRECT")
        n.destroy_node()
        rclpy.shutdown()
        return 3

    st = n.go(240.0)
    assert n.odom is not None
    x, y = n.odom.pose.pose.position.x, n.odom.pose.pose.position.y
    yaw = yaw_of(n.odom)
    err_xy = math.hypot(x - GOAL[0], y - GOAL[1])
    err_yaw = ang_err(yaw, GOAL[2])
    tq = trajectory_quality(n.trace)
    plan_clearance = _clearance.shared().profile(n.plan_pts)
    nav_xy_ok = err_xy <= nav_tol_xy
    nav_yaw_ok = err_yaw <= nav_tol_yaw
    dod_xy_ok = err_xy <= DOD_TOL_XY
    dod_yaw_ok = err_yaw <= DOD_TOL_YAW
    # The padded footprint is in collision below HALF_WIDTH_M, so a plan or a driven trace
    # that goes under it is a geometry failure no matter how the goal ended.
    trace_min_clear = tq["trace_clearance"]["min"]
    plan_min_clear = plan_clearance["min"]
    clearance_ok = (
        trace_min_clear is not None
        and trace_min_clear >= _clearance.HALF_WIDTH_M
        and plan_min_clear is not None
        and plan_min_clear >= _clearance.HALF_WIDTH_M
    )
    clearance_warn = [
        label
        for label, val in (("trace", trace_min_clear), ("plan", plan_min_clear))
        if val is not None and val < _clearance.WARN_M
    ]
    ok = (
        st == "status_4"
        and nav_xy_ok
        and nav_yaw_ok
        and dod_xy_ok
        and dod_yaw_ok
        and clearance_ok
        and not tq["west_keepout"]
        and not tq["oneway_reverse_ltr_c"]
    )
    result = {
        "mode": "direct_single_goal",
        "cm": CM_MODE,
        "status": st,
        "err_xy": err_xy,
        "err_yaw": err_yaw,
        "nav_tol_xy": nav_tol_xy,
        "nav_tol_yaw": nav_tol_yaw,
        "nav_xy_ok": nav_xy_ok,
        "nav_yaw_ok": nav_yaw_ok,
        "dod_tol_xy": DOD_TOL_XY,
        "dod_tol_yaw": DOD_TOL_YAW,
        "dod_xy_ok": dod_xy_ok,
        "dod_yaw_ok": dod_yaw_ok,
        "odom": [x, y, yaw],
        "auth_end": n.auth,
        "cmd_counts": {"nav": n.cmd_nav, "safe": n.cmd_safe, "out": n.cmd_out},
        "plan_n": len(n.plan_pts),
        "plan_min_y": min((p[1] for p in n.plan_pts), default=None),
        "plan_clearance": plan_clearance,
        "clearance_ok": clearance_ok,
        "clearance_warn": clearance_warn,
        "live_controller": live_ctrl,
        "live_collision_monitor": live_cm,
        "live_inflation": live_infl,
        "pass": ok,
        **tq,
    }
    dbg("end", result, "DIRECT")
    print(json.dumps(result, indent=2), flush=True)
    print(f"PASS={ok}", flush=True)
    n.destroy_node()
    rclpy.shutdown()
    return 0 if ok else 4


if __name__ == "__main__":
    raise SystemExit(main())
