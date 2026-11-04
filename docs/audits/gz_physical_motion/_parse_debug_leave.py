#!/usr/bin/env python3
import json
from pathlib import Path

lines = Path("/mnt/e/programming/my_project/warotrans-system/debug-100d90.log").read_text().splitlines()
for L in lines:
    o = json.loads(L)
    d = o.get("data", {})
    m = o.get("message")
    if m in ("pre_done", "via_done", "exit_done", "north_done", "mid_done", "send_goal", "end", "xy_early_accept"):
        print(m, {k: d.get(k) for k in ("label", "status", "xy_near", "xy", "auth", "wall_hug", "exit_hit", "mid_hit", "east_before_north", "pass")})
    if m == "progress" and d.get("label") in ("pre", "via", "exit", "north", "mid") and d.get("t") in (0, 2, 4, 6, 8, 10, 20, 40):
        print(
            "prog",
            d.get("label"),
            "t",
            d.get("t"),
            "xy",
            d.get("xy"),
            "min_y",
            d.get("plan_min_y"),
            "auth",
            d.get("auth"),
        )
