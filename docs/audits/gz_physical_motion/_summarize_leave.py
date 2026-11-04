#!/usr/bin/env python3
import json
from pathlib import Path

rows = [
    json.loads(L)
    for L in Path("/mnt/e/programming/my_project/warotrans-system/debug-100d90.log").read_text().splitlines()
    if "leave-off" in L and "verify_parking" in L
]
pro = [r for r in rows if r["message"] == "progress"]
print("n_progress", len(pro))
step = max(1, len(pro) // 20)
for r in pro[::step]:
    d = r["data"]
    print(
        f"t={d['t']:5.1f} xy=({d['xy'][0]:6.2f},{d['xy'][1]:6.2f}) "
        f"yaw={d['yaw']:5.2f} cte={d['cte']:5.2f} auth={d['auth']}"
    )
end = [r for r in rows if r["message"] == "end"][-1]["data"]
keys = [
    "status",
    "err_xy",
    "err_yaw",
    "via_hit",
    "mid_hit",
    "wall_hug",
    "cte_mean",
    "yaw_delta_mean",
    "pass",
    "auth_true",
]
print("END", {k: end[k] for k in keys})
print("max_y", max(p["data"]["xy"][1] for p in pro), "min_y", min(p["data"]["xy"][1] for p in pro))
print("max_x", max(p["data"]["xy"][0] for p in pro))
