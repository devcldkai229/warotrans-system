#!/usr/bin/env python3
"""Rewrite sim lanes.json from read-only Map Editor snapshot (no EDGE-LEAVE)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, "/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/scripts")
import semantic_map_adapter as sma  # noqa: E402

snap = json.loads(
    Path("/mnt/e/programming/my_project/warotrans-system/samples/maps/MAP-ONE-V001/snapshot.json").read_text(
        encoding="utf-8"
    )
)
lanes = sma.export_lanes(snap["edges"])
out = Path("/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/maps/map_one_v001/lanes.json")
# Preserve margin if present in current file.
margin = 0.05
try:
    cur = json.loads(out.read_text(encoding="utf-8"))
    margin = float(cur.get("margin_meters", 0.05))
except Exception:
    pass
payload = {"lanes": lanes, "margin_meters": margin}
out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print("wrote", out, "n_lanes", len(lanes), "codes", [l["code"] for l in lanes])
