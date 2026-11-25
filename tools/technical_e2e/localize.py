"""Wait for the robot's Nav2 to be active, then LOCALIZE it at a pose (bench: EP-PARKING-B by default)."""
import sys
import time

import pi
from api import Api

x, y, yaw = (float(v) for v in (sys.argv[1:4] if len(sys.argv) >= 4 else ("0.104", "-1.588", "1.571")))
c = pi.connect()
for _ in range(40):
    _, out = pi.run(c, "journalctl -u warotrans-rbt002 -b --no-pager | tac | sed '/Started warotrans/q' | grep -c 'lifecycle_manager_navigation.*Managed nodes are active'", sudo=True)
    if out.strip() not in ("", "0"):
        break
    time.sleep(6)
a = Api()
rid = next(r["id"] for r in a.host("GET", "/api/fleet/robots?take=50")["items"] if r["code"] == "RBT-002")
for _ in range(10):
    try:
        a.host("POST", f"/api/fleet/robots/{rid}/commands/localize", {"x": x, "y": y, "yaw": yaw})
        break
    except Exception as e:  # noqa: BLE001 - offline right after a restart
        time.sleep(5)
time.sleep(6)
r = a.host("GET", f"/api/fleet/robots/{rid}")
print({k: r.get(k) for k in ("isOnline", "status", "localizationStatus", "poseX", "poseY")})
