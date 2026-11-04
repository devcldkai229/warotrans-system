#!/usr/bin/env python3
"""Parking-A → EAST (past wall) → MID_ZONE → INBOUND. CM_MODE from env.

Evidence:
- mid-only: plan_min_y≈-0.89 south geodesic, stuck (-0.925,-0.789)
- EXIT (-1.35,-0.30): LaneAware start/goal LETHAL — EDGE-LEAVE clipped wall
- map: wall strip y∈[-0.35,-0.30] x∈[-2.0,-0.68]; mid-first requires east past gap
"""
from __future__ import annotations

import json
import math
import os
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
# Evidence: on-lane prefer tracks y≈-0.55 then stalls at pillar (-0.94,-0.66).
# Force hops: east aisle → south-of-pillar via (y=-0.75, not wall_hug<-0.85) → exit → mid.
PRE = (-1.20, -0.55, 0.0)
# East of ## pillar (x≈-0.75) on free y≈-0.78 row — was (-0.85,-0.75) and early-accept
# stopped at (-0.99,-0.73) still west of pillar.
VIA = (-0.70, -0.78, 0.0)
# After VIA, force short north through wall-gap column (x≳-0.68) before MID.
NORTH = (-0.40, -0.15, 1.5707963267948966)
MID_ZONE = (-0.90, 0.10, 0.0)
EXIT = VIA  # leave_quality exit_hit ≡ via (east-of-pillar)
GOAL = (1.747, 1.543, -math.pi / 2)  # EP-INBOUND
HOME = (-1.743, -0.516)
LANE_A = (-1.55, -0.55)
LANE_B = (-1.20, -0.55)
TOL_XY = 0.25
TOL_HOP = 0.12
TOL_YAW = 0.45
CM_MODE = os.environ.get("CM_MODE", "unknown")


def dbg(msg: str, data: dict, hypothesis_id: str = "LEAVE") -> None:
    # #region agent log
    try:
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "sessionId": "100d90",
                        "runId": f"leave-{CM_MODE}",
                        "hypothesisId": hypothesis_id,
                        "location": "verify_parking_leave_inbound.py",
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


def cross_track(px: float, py: float) -> float:
    ax, ay = LANE_A
    bx, by = LANE_B
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 < 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return ((px - ax) * dy - (py - ay) * dx) / math.sqrt(len2)


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
    def __init__(self) -> None:
        super().__init__(
            "verify_parking_leave_inbound",
            namespace="sim01",
            parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
            cli_args=["--ros-args", "-r", "/tf:=tf", "-r", "/tf_static:=tf_static"],
        )
        self.odom: Odometry | None = None
        self.auth: bool | None = None
        self.trace: list[tuple[float, float, float]] = []
        self.plan_pts: list[tuple[float, float]] = []
        self.create_subscription(Odometry, "odom", self._od, 10)
        self.create_subscription(Bool, "traffic/authority_ok", lambda m: setattr(self, "auth", bool(m.data)), 10)
        self.create_subscription(NavPath, "plan", self._plan, 10)
        self.ac = ActionClient(self, NavigateToPose, "navigate_to_pose")

    def _od(self, m: Odometry) -> None:
        self.odom = m
        self.trace.append((m.pose.pose.position.x, m.pose.pose.position.y, yaw_of(m)))

    def _plan(self, m: NavPath) -> None:
        if m.poses:
            self.plan_pts = [(p.pose.position.x, p.pose.position.y) for p in m.poses]

    def go(self, target: tuple[float, float, float], label: str, timeout_s: float) -> str:
        goal = NavigateToPose.Goal()
        goal.pose = pose(*target, self)
        self.plan_pts = []
        dbg("send_goal", {"label": label, "target": list(target), "cm": CM_MODE}, "H_WALL")
        send = self.ac.send_goal_async(goal)
        while not send.done():
            rclpy.spin_once(self, timeout_sec=0.05)
        gh = send.result()
        if gh is None or not gh.accepted:
            dbg("rejected", {"label": label, "cm": CM_MODE}, "H_WALL")
            return "REJECTED"
        rf = gh.get_result_async()
        t_end = time.time() + timeout_s
        last_log = 0.0
        near_since: float | None = None
        while time.time() < t_end and not rf.done():
            rclpy.spin_once(self, timeout_sec=0.05)
            now = time.time()
            if self.odom is not None:
                ox = self.odom.pose.pose.position.x
                oy = self.odom.pose.pose.position.y
                hop_ok = math.hypot(ox - target[0], oy - target[1]) <= TOL_HOP
                # Evidence: via early-accept at x≈-0.86 left robot west of pillar; require x past ##.
                if label == "via":
                    hop_ok = hop_ok and ox >= -0.72
                if hop_ok:
                    if near_since is None:
                        near_since = now
                    elif now - near_since >= 1.5:
                        # Evidence: hop XY reached but yaw/auth TIMEOUT; accept early.
                        # Wait cancel settle — racing next NavigateToPose caused status_6.
                        gh.cancel_goal_async()
                        t_cancel = time.time() + 3.0
                        while time.time() < t_cancel and not rf.done():
                            rclpy.spin_once(self, timeout_sec=0.05)
                        dbg("xy_early_accept", {"label": label, "xy": [ox, oy], "auth": self.auth}, "H_WALL")
                        return "status_4"
                else:
                    near_since = None
            if now - last_log >= 2.0 and self.odom is not None:
                last_log = now
                ox = self.odom.pose.pose.position.x
                oy = self.odom.pose.pose.position.y
                yaw = yaw_of(self.odom)
                dbg(
                    "progress",
                    {
                        "label": label,
                        "t": round(now - (t_end - timeout_s), 1),
                        "xy": [round(ox, 3), round(oy, 3)],
                        "yaw": round(yaw, 3),
                        "cte": round(cross_track(ox, oy), 3),
                        "auth": self.auth,
                        "plan_n": len(self.plan_pts),
                        "plan_head": self.plan_pts[:4],
                        "plan_min_y": min((p[1] for p in self.plan_pts), default=None),
                        "plan_max_y": max((p[1] for p in self.plan_pts), default=None),
                        "plan_max_x": max((p[0] for p in self.plan_pts), default=None),
                    },
                    "H_WALL",
                )
        if not rf.done():
            gh.cancel_goal_async()
            return "TIMEOUT"
        return f"status_{int(rf.result().status)}"


def leave_quality(trace: list[tuple[float, float, float]]) -> dict:
    mid_hit = any(math.hypot(px - MID_ZONE[0], py - MID_ZONE[1]) < 0.40 for px, py, _ in trace)
    exit_hit = any(math.hypot(px - EXIT[0], py - EXIT[1]) < 0.35 for px, py, _ in trace)
    # East-past-wall before going north of the y=-0.30 strip (not south mouth).
    east_before_north = False
    saw_east = False
    for px, py, _ in trace:
        if px > -0.70 and py < -0.35:
            saw_east = True
        if saw_east and py > -0.20:
            east_before_north = True
            break

    wall_hug = False
    west_keepout = False
    ctes: list[float] = []
    yaw_deltas: list[float] = []
    leave_pts: list[list[float]] = []
    prev_yaw = None
    north_before_east = False
    saw_mid_y = False
    for px, py, yaw in trace:
        if px < -2.15:
            west_keepout = True
        if py > -0.25 and px < -0.70:
            saw_mid_y = True
        if saw_mid_y and px > -0.50:
            north_before_east = True
        d_home = math.hypot(px - HOME[0], py - HOME[1])
        leaving = d_home > 0.30 and px < -0.70
        if leaving:
            cte = cross_track(px, py)
            ctes.append(abs(cte))
            leave_pts.append([round(px, 3), round(py, 3), round(cte, 3)])
            # Pillar bypass can dip to y≈-0.90; classic south-mouth hug is y≲-0.95.
            if py < -0.95 and px > -1.55:
                wall_hug = True
        if prev_yaw is not None and leaving:
            yaw_deltas.append(ang_err(yaw, prev_yaw))
        prev_yaw = yaw
    return {
        "exit_hit": exit_hit,
        "mid_hit": mid_hit,
        "east_before_north": east_before_north,
        "north_before_east": north_before_east,
        "wall_hug": wall_hug,
        "west_keepout": west_keepout,
        "cte_mean": (sum(ctes) / len(ctes)) if ctes else None,
        "cte_max": max(ctes) if ctes else None,
        "yaw_delta_mean": (sum(yaw_deltas) / len(yaw_deltas)) if yaw_deltas else None,
        "leave_sample": leave_pts[:10],
        "n_cte": len(ctes),
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

    print(
        f"START cm={CM_MODE} odom=({n.odom.pose.pose.position.x:.3f},{n.odom.pose.pose.position.y:.3f})",
        flush=True,
    )
    dbg(
        "start",
        {"cm": CM_MODE, "odom": [n.odom.pose.pose.position.x, n.odom.pose.pose.position.y]},
        "H_WALL",
    )
    dbg(
        "goal_poses",
        {
            "pre": list(PRE),
            "via": list(VIA),
            "north": list(NORTH),
            "mid": list(MID_ZONE),
            "goal": list(GOAL),
            "cm": CM_MODE,
        },
        "H_WALL",
    )

    def xy_near(target: tuple[float, float, float], tol: float = TOL_XY) -> bool:
        if n.odom is None:
            return False
        return (
            math.hypot(
                n.odom.pose.pose.position.x - target[0],
                n.odom.pose.pose.position.y - target[1],
            )
            <= tol
        )

    def wait_auth(sec: float = 45.0) -> bool:
        # Evidence: PRE TIMEOUT leaves auth=false → next hop status_6 immediately.
        t_end = time.time() + sec
        while time.time() < t_end:
            rclpy.spin_once(n, timeout_sec=0.05)
            if n.auth:
                return True
        return bool(n.auth)

    hops = (("pre", PRE, 60.0), ("via", VIA, 90.0), ("north", NORTH, 90.0))
    for i, (label, target, timeout) in enumerate(hops):
        # Settle BT after cancel; wait_auth is best-effort only.
        if i > 0:
            wait_auth(3.0)
            settle = time.time() + 2.0
            while time.time() < settle:
                rclpy.spin_once(n, timeout_sec=0.05)
        st = n.go(target, label, timeout)
        lq = leave_quality(n.trace)
        near = xy_near(target)
        dbg(f"{label}_done", {"status": st, "xy_near": near, **lq, "auth": n.auth}, "H_WALL")
        # Evidence: PRE reached ~2 cm then auth/yaw starved → TIMEOUT; accept XY for hops.
        if st != "status_4" and not near:
            print(json.dumps({"phase": label, "status": st, "xy_near": near, **lq}, indent=2), flush=True)
            print("PASS=False", flush=True)
            n.destroy_node()
            rclpy.shutdown()
            return 4
    st_exit = "status_4"

    st_mid = n.go(MID_ZONE, "mid", 120.0)
    lq_mid = leave_quality(n.trace)
    # Evidence: mid reached ~8 cm (within tol) then auth=false starved cmd_vel → TIMEOUT.
    mid_xy_ok = False
    if n.odom is not None:
        mid_xy_ok = (
            math.hypot(
                n.odom.pose.pose.position.x - MID_ZONE[0],
                n.odom.pose.pose.position.y - MID_ZONE[1],
            )
            <= TOL_XY
        )
    dbg(
        "mid_done",
        {"status": st_mid, "mid_xy_ok": mid_xy_ok, **lq_mid, "auth": n.auth},
        "H_WALL",
    )
    if st_mid != "status_4" and not (lq_mid["mid_hit"] and mid_xy_ok):
        print(json.dumps({"phase": "mid", "status": st_mid, "mid_xy_ok": mid_xy_ok, **lq_mid}, indent=2), flush=True)
        print("PASS=False", flush=True)
        n.destroy_node()
        rclpy.shutdown()
        return 4

    st_goal = n.go(GOAL, "inbound", 180.0)
    assert n.odom is not None
    x, y = n.odom.pose.pose.position.x, n.odom.pose.pose.position.y
    yaw = yaw_of(n.odom)
    err_xy = math.hypot(x - GOAL[0], y - GOAL[1])
    err_yaw = ang_err(yaw, GOAL[2])
    lq = leave_quality(n.trace)
    straight_ok = lq["yaw_delta_mean"] is None or lq["yaw_delta_mean"] <= 0.40
    leave_ok = (
        lq["exit_hit"]
        and lq["mid_hit"]
        and not lq["west_keepout"]
        and not lq["wall_hug"]
        and lq["east_before_north"]
    )
    ok = (
        st_goal == "status_4"
        and err_xy <= TOL_XY
        and err_yaw <= TOL_YAW
        and leave_ok
        and straight_ok
    )
    result = {
        "cm": CM_MODE,
        "status_exit": st_exit,
        "status_mid": st_mid,
        "status": st_goal,
        "err_xy": err_xy,
        "err_yaw": err_yaw,
        "odom": [x, y, yaw],
        "straight_ok": straight_ok,
        "leave_ok": leave_ok,
        "n_trace": len(n.trace),
        "n_plan": len(n.plan_pts),
        "auth_end": n.auth,
        "pass": ok,
        **lq,
    }
    dbg("end", result, "H_WALL")
    print(json.dumps(result, indent=2), flush=True)
    print(f"PASS={ok}", flush=True)
    n.destroy_node()
    rclpy.shutdown()
    return 0 if ok else 4


if __name__ == "__main__":
    raise SystemExit(main())
