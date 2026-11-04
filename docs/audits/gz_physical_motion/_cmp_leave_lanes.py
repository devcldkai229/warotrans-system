#!/usr/bin/env python3
"""Compare current EDGE-LEAVE vs git HEAD (Map Editor export baseline)."""
import json
import subprocess
from pathlib import Path

ROOT = Path("/mnt/e/programming/my_project/warotrans")
path = "ros2_ws/src/warotrans_simulation/maps/map_one_v001/lanes.json"


def leave(lanes):
    return [l for l in lanes.get("lanes", []) if "LEAVE" in l.get("code", "")]


cur = json.loads((ROOT / path).read_text(encoding="utf-8"))
head = subprocess.check_output(
    ["git", "show", f"HEAD:{path}"], cwd=ROOT, text=True
)
head_j = json.loads(head)
print("=== HEAD (committed / Map Editor export baseline) ===")
print(json.dumps(leave(head_j), indent=2))
print("=== CURRENT (working tree) ===")
print(json.dumps(leave(cur), indent=2))
print("DIVERGED", leave(cur) != leave(head_j))
