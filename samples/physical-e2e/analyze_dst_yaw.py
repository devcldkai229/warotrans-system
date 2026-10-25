"""Replay 5 Hz telemetry around the DST arrival from the MQTT trace of the physical run."""
import json
import math
from pathlib import Path

TRACE = Path(__file__).resolve().parent / "responses" / "05-mqtt-trace.json"
GX, GY, GYAW = 2.312, -0.84, -0.028


def main() -> None:
    data = json.loads(TRACE.read_text(encoding="utf-8-sig"))
    for e in data["events"]:
        if not ("2026-10-21T07:10:36" <= e["ts"] <= "2026-10-21T07:10:58"):
            continue
        kind, pl = e["kind"], e["payload"]
        if kind == "telemetry":
            po = pl.get("pose") or {}
            x, y, yaw = po["x"], po["y"], po["yaw"]
            dist = math.hypot(x - GX, y - GY)
            yaw_err = math.degrees(math.atan2(math.sin(yaw - GYAW), math.cos(yaw - GYAW)))
            heading_to_goal = math.degrees(math.atan2(GY - y, GX - x))
            print(
                f"{e['ts'][11:23]} TEL x={x:.3f} y={y:.3f} yaw={yaw:+.3f} dist={dist:.3f} "
                f"yawErr={yaw_err:+6.1f}deg bearingToGoal={heading_to_goal:+6.1f}deg "
                f"v={pl['linearVelocity']:+.3f} w={pl['angularVelocity']:+.3f} nav={pl['navigationStatus']}"
            )
        elif kind != "heartbeat":
            body = pl.get("result") or pl.get("payload") or pl.get("outcome")
            print(f"{e['ts'][11:23]} {kind.upper()} {json.dumps(body)[:160]}")


if __name__ == "__main__":
    main()
