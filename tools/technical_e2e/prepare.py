"""Prepare the bench for the technical E2E (RBT-002 on a stand, MAP-ONE-V021).

    WARO_PI_PW=... python prepare.py [--robot RBT-002] [--skip-credential]

1. The robot's map in the Host = MAP-ONE-V021 (it must be idle).
2. A new evidence credential for the robot, written straight into the robot's env file (never printed).
3. The robot env for the bench: V021 bundle, no lane graph, BENCH_MODE at EP-PARKING-B, LAB_ENABLED, motors on.
4. Restart the robot service.
5. Open AI cases from earlier days are dismissed, so every lab fault opens its own case.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from api import Api, ApiError  # noqa: E402
import pi  # noqa: E402

V021_ID = "2fc0b8eb-91a3-4a21-8429-cb89daf15648"
BUNDLE = "/home/waro/warotrans_rbt2_ws/src/warotrans_navigation/maps/map_one_v021"
PARKING_B = (0.104, -1.588, 1.571)
OPEN = ("DETECTED", "REOPENED", "NEEDS_MORE_EVIDENCE", "ANALYSIS_INCOMPLETE", "DIAGNOSED")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--robot", default="RBT-002")
    ap.add_argument("--skip-credential", action="store_true")
    ap.add_argument("--skip-cases", action="store_true")
    a = ap.parse_args()
    api = Api()

    robots = api.host("GET", "/api/fleet/robots?take=50")["items"]
    robot = next(r for r in robots if r["code"] == a.robot)
    if robot["currentMapVersionId"] != V021_ID:
        api.host("PUT", f"/api/fleet/robots/{robot['id']}/map", {"mapVersionId": V021_ID})
        print(f"{a.robot}: map -> MAP-ONE-V021")
    else:
        print(f"{a.robot}: already on MAP-ONE-V021")

    env = [f"BUNDLE={BUNDLE}", "ROUTE_GRAPH=", "MODE=fleet", "MOTORS_ENABLED=true", "BENCH_MODE=true",
           f"BENCH_X={PARKING_B[0]}", f"BENCH_Y={PARKING_B[1]}", f"BENCH_YAW={PARKING_B[2]}", "LAB_ENABLED=true"]
    if not a.skip_credential:
        cred = api.recorder("POST", f"/admin/robots/{a.robot}/credentials", {})
        token = cred.get("token") or cred.get("secret") or cred.get("credential")
        if not token:
            raise SystemExit(f"credential response has no token field: {sorted(cred)}")
        env.append(f"WARO_EVIDENCE_TOKEN={token}")
        print(f"{a.robot}: new evidence credential issued")
    pi.env_set(env)
    c = pi.connect()
    # A fresh bench pose file: the robot starts at EP-PARKING-B.
    code, out = pi.run(c, "rm -f ~/.cache/warotrans/bench_pose.json; systemctl restart warotrans-rbt002 && "
                          "sleep 3 && systemctl is-active warotrans-rbt002", sudo=True)
    print("service:", out.strip())

    if not a.skip_cases:
        for case in api.ai("GET", "/cases")["items"]:
            if case["status"] in OPEN:
                try:
                    api.ai("POST", f"/cases/{case['id']}/dismiss", {"reason": "before the technical E2E of 2026-11-24"})
                    print("dismissed", case["id"], case["title"])
                except ApiError as e:
                    print("could not dismiss", case["id"], e)


if __name__ == "__main__":
    main()
