#!/usr/bin/env python3
import csv
import math
from pathlib import Path

p = Path(__file__).with_name("gt_trace.csv")
rows = list(csv.DictReader(p.open(encoding="utf-8")))
print("rows", len(rows))
c = 0
for r in rows:
    nav = float(r["cmd_nav_vx"])
    safe = float(r["cmd_safe_vx"])
    gated = float(r["cmd_gated_vx"])
    if abs(nav) > 1e-4 or abs(safe) > 1e-4 or abs(gated) > 1e-4:
        print(
            f"t={r['wall_t']} odom=({r['odom_x']},{r['odom_y']}) "
            f"nav={nav:.3f}/{float(r['cmd_nav_wz']):.3f} "
            f"safe={safe:.3f} gated={gated:.3f} auth={r['authority_ok']} age={r['authority_ok_age']}"
        )
        c += 1
        if c >= 30:
            break
print("--- odom jumps >2cm ---")
prev = None
for r in rows:
    if not r["odom_x"]:
        continue
    xy = (float(r["odom_x"]), float(r["odom_y"]))
    if prev and math.hypot(xy[0] - prev[0], xy[1] - prev[1]) > 0.02:
        print(r["wall_t"], prev, "->", xy, "gated", r["cmd_gated_vx"], "auth", r["authority_ok"])
    prev = xy
