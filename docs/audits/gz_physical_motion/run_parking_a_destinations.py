#!/usr/bin/env python3
"""Parking-A → each legal destination; GT odom arrival ≤ tol. Return to Parking-A between goals."""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from nav_msgs.msg import Odometry
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import Bool

LOG = Path("/mnt/e/programming/my_project/warotrans-system/debug-100d90.log")
REPORT = Path(
    "/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/"
    "PARKING_A_DESTINATION_RESULTS.json"
)
# Match nav2_params_sim xy_goal_tolerance with aisle AMCL floor margin.
TOL_M = 0.25
GOAL_TIMEOUT_S = 240.0
RETURN_TIMEOUT_S = 180.0

# Layout map_one_v001 — user-requested destinations (+ home).
HOME = ("EP-PARKING-A", -1.743, -0.516, -math.pi / 2)
DESTS = [
    ("EP-INBOUND", 1.747, 1.543, -math.pi / 2),
    ("EP-OUTBOUND", 1.793, -0.977, math.pi / 2),
    ("EP-WAIT-POINT", 1.292, 0.83, 0.0),
    ("EP-SHELF-A-01", -1.325, 1.644, math.pi),
    ("EP-SHELF-C-01", 0.875, -0.777, math.pi / 2),
    ("EP-SHELF-B-04", 0.793, 1.671, math.pi),
]


def dbg(message: str, data: dict) -> None:
    # #region agent log
    try:
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "sessionId": "100d90",
                        "runId": "dest-tour",
                        "hypothesisId": "DEST",
                        "location": "run_parking_a_destinations.py",
                        "message": message,
                        "data": data,
                        "timestamp": int(time.time() * 1000),
                    },
                    ensure_ascii=True,
                )
                + "\n"
            )
    except Exception:
        pass
    # #endregion


class Runner(Node):
    def __init__(self) -> None:
        super().__init__(
            "parking_a_dest_runner",
            namespace="sim01",
            parameter_overrides=[Parameter("use_sim_time", Parameter.Type.BOOL, True)],
            cli_args=["--ros-args", "-r", "/tf:=tf", "-r", "/tf_static:=tf_static"],
        )
        self.odom: tuple[float, float] | None = None
        self.auth: bool | None = None
        self.create_subscription(Odometry, "odom", self._od, 10)
        self.create_subscription(Bool, "traffic/authority_ok", self._au, 10)
        self.ac = ActionClient(self, NavigateToPose, "navigate_to_pose")

    def _od(self, m: Odometry) -> None:
        self.odom = (m.pose.pose.position.x, m.pose.pose.position.y)

    def _au(self, m: Bool) -> None:
        self.auth = bool(m.data)

    def spin_until(self, pred, timeout_s: float) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout_s:
            rclpy.spin_once(self, timeout_sec=0.05)
            if pred():
                return True
        return False

    def navigate(self, code: str, x: float, y: float, yaw: float, timeout_s: float) -> dict:
        assert self.odom is not None
        o0 = self.odom
        g = NavigateToPose.Goal()
        g.pose = PoseStamped()
        g.pose.header.frame_id = "map"
        g.pose.header.stamp = self.get_clock().now().to_msg()
        g.pose.pose.position.x = x
        g.pose.pose.position.y = y
        g.pose.pose.orientation.z = math.sin(yaw / 2.0)
        g.pose.pose.orientation.w = math.cos(yaw / 2.0)
        send = self.ac.send_goal_async(g)
        while not send.done():
            rclpy.spin_once(self, timeout_sec=0.05)
        gh = send.result()
        if gh is None or not gh.accepted:
            return {
                "code": code,
                "accepted": False,
                "status": "REJECTED",
                "pass": False,
                "err_m": None,
                "odom0": list(o0),
                "odom1": list(self.odom) if self.odom else None,
                "goal": [x, y],
            }
        rf = gh.get_result_async()
        t_end = time.time() + timeout_s
        while time.time() < t_end and not rf.done():
            rclpy.spin_once(self, timeout_sec=0.05)
        o1 = self.odom
        status = "TIMEOUT"
        if rf.done():
            status = f"status_{int(rf.result().status)}"
        err = None if o1 is None else math.hypot(o1[0] - x, o1[1] - y)
        # status_4 == SUCCEEDED (action_msgs GoalStatus)
        arrived = err is not None and err <= TOL_M
        ok = arrived and status == "status_4"
        return {
            "code": code,
            "accepted": True,
            "status": status,
            "pass": bool(ok),
            "arrived_xy": bool(arrived),
            "err_m": err,
            "disp_m": None if o1 is None else math.hypot(o1[0] - o0[0], o1[1] - o0[1]),
            "odom0": list(o0),
            "odom1": list(o1) if o1 else None,
            "goal": [x, y],
            "auth_end": self.auth,
        }


def main() -> int:
    rclpy.init()
    n = Runner()
    if not n.spin_until(lambda: n.odom is not None, 30.0):
        print("NO_ODOM", flush=True)
        dbg("fatal", {"reason": "no_odom"})
        return 1
    if not n.ac.wait_for_server(timeout_sec=60.0):
        print("NO_SERVER", flush=True)
        dbg("fatal", {"reason": "no_action_server"})
        return 2

    results: list[dict] = []
    print(f"HOME_CHECK odom={n.odom}", flush=True)
    # Ensure near Parking-A before first leg (respawn may already be there).
    home_err = math.hypot(n.odom[0] - HOME[1], n.odom[1] - HOME[2])
    if home_err > 0.35:
        print(f"RETURN_HOME first (err={home_err:.3f})", flush=True)
        r = n.navigate(*HOME, RETURN_TIMEOUT_S)
        results.append({"phase": "home_first", **r})
        dbg("leg", results[-1])
        print(f"  -> {r['status']} err={r['err_m']} pass={r['pass']}", flush=True)
        home_err = math.hypot(n.odom[0] - HOME[1], n.odom[1] - HOME[2])
        if home_err > 0.35:
            print(f"ABORT not at Parking-A (err={home_err:.3f}) — relaunch sim", flush=True)
            dbg("fatal", {"reason": "not_at_home", "err": home_err, "odom": list(n.odom)})
            n.destroy_node()
            rclpy.shutdown()
            return 4

    for code, x, y, yaw in DESTS:
        print(f"=== GO {code} ({x},{y}) ===", flush=True)
        dbg("leg_start", {"code": code, "odom": list(n.odom), "auth": n.auth})
        r = n.navigate(code, x, y, yaw, GOAL_TIMEOUT_S)
        results.append({"phase": "to_dest", **r})
        dbg("leg", results[-1])
        print(
            f"  -> {r['status']} err={r['err_m']} disp={r.get('disp_m')} pass={r['pass']}",
            flush=True,
        )
        # Always try return home for next independent leg from Parking-A.
        print("=== RETURN EP-PARKING-A ===", flush=True)
        rh = n.navigate(*HOME, RETURN_TIMEOUT_S)
        results.append({"phase": "return_home", "from": code, **rh})
        dbg("leg", results[-1])
        print(
            f"  -> {rh['status']} err={rh['err_m']} pass={rh['pass']}",
            flush=True,
        )
        if not r["pass"]:
            # Continue remaining destinations; report aggregate FAIL.
            pass

    dest_rows = [r for r in results if r.get("phase") == "to_dest"]
    summary = {
        "tol_m": TOL_M,
        "collision_monitor": "OFF_DIAG",
        "n_dest": len(DESTS),
        "n_pass": sum(1 for r in dest_rows if r.get("pass")),
        "all_pass": all(r.get("pass") for r in dest_rows),
        "destinations": dest_rows,
        "all_legs": results,
    }
    REPORT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    dbg("summary", {"all_pass": summary["all_pass"], "n_pass": summary["n_pass"]})
    print(
        f"SUMMARY pass={summary['n_pass']}/{summary['n_dest']} all_pass={summary['all_pass']}",
        flush=True,
    )
    print(f"REPORT {REPORT}", flush=True)
    n.destroy_node()
    rclpy.shutdown()
    return 0 if summary["all_pass"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
