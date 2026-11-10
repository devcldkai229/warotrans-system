#!/usr/bin/env python3
import math
import sys
from pathlib import Path

ROOT = Path("/mnt/e/programming/my_project/warotrans/ros2_ws")
sys.path.insert(0, str(ROOT / "src/warotrans_simulation/scripts"))
from spawn_pose import (  # noqa: E402
    footprint_clear,
    load_occupied_cells_ros,
    load_yaml,
    nudge_spawn_to_clear,
    resolve_spawn,
)

layout = ROOT / "src/warotrans_simulation/config/layouts/map_one_v001.yaml"
map_yaml = ROOT / "src/warotrans_simulation/maps/map_one_v001/map.yaml"
occ, meta = load_occupied_cells_ros(map_yaml)
print("meta", meta)
pose = {"x": -1.848, "y": -0.525, "yaw": -math.pi / 2}
ok, reason = footprint_clear(
    pose,
    occupied_cells=occ,
    origin_x=meta["origin_x"],
    origin_y=meta["origin_y"],
    resolution=meta["resolution"],
)
print("authored clear?", ok, reason)
nudged = nudge_spawn_to_clear(
    pose,
    occupied_cells=occ,
    origin_x=meta["origin_x"],
    origin_y=meta["origin_y"],
    resolution=meta["resolution"],
)
print("nudged", nudged)
resolved = resolve_spawn(layout, map_yaml=map_yaml, require_clearance=False)
print("resolve_spawn", resolved)
for label, xy in [("PARK-B", (-1.434, -0.529)), ("CHARGING-A", (-1.02, -0.529)), ("INBOUND", (1.747, 1.543))]:
    p = {"x": xy[0], "y": xy[1], "yaw": -math.pi / 2}
    ok2, r2 = footprint_clear(
        p,
        occupied_cells=occ,
        origin_x=meta["origin_x"],
        origin_y=meta["origin_y"],
        resolution=meta["resolution"],
    )
    print(label, "clear", ok2, r2)
