#!/usr/bin/env python3
"""Measured obstacle clearance from the sim occupancy grid.

Replaces the `wall_hug` box heuristic. That predicate (y < -0.95 and -1.55 < x < -0.50)
inverts the real geometry of MAP-ONE-V001: escaping the EP-PARKING-A pocket eastward
requires y <= -0.85, and the widest line through the pillar gap is y ~ -0.99 at
0.30-0.41 m clearance -- which `wall_hug` would fail -- while the 0.150 m squeeze along
y ~ -0.84 that Collision Monitor actually held on would pass.

Clearance here is the distance from a pose to the nearest occupied cell centre, compared
against the padded footprint:
  HALF_WIDTH    0.15  -- straight travel; below this the footprint is in collision
  CIRCUMSCRIBED 0.234 -- rotating in place; below this a turn clips an obstacle
"""
from __future__ import annotations

import math
from pathlib import Path

MAP_DIR = Path(
    "/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/maps/map_one_v001"
)

# Footprint [[0.16,0.13],...] + footprint_padding 0.02 -> padded 0.36 x 0.30.
HALF_WIDTH_M = 0.15
CIRCUMSCRIBED_M = math.hypot(0.18, 0.15)  # 0.2343
WARN_M = 0.18


def _load_p5(path: Path) -> tuple[int, int, int, bytes]:
    data = path.read_bytes()
    if not data.startswith(b"P5"):
        raise ValueError(f"{path} is not a binary PGM")
    idx = 2
    tokens: list[int] = []
    while len(tokens) < 3:
        while idx < len(data) and data[idx] in b" \t\n\r":
            idx += 1
        if data[idx : idx + 1] == b"#":
            while idx < len(data) and data[idx] not in b"\n\r":
                idx += 1
            continue
        start = idx
        while idx < len(data) and data[idx] not in b" \t\n\r":
            idx += 1
        tokens.append(int(data[start:idx]))
    idx += 1
    width, height, maxval = tokens
    return width, height, maxval, data[idx : idx + width * height]


def _load_yaml_scalars(path: Path) -> dict:
    """Minimal reader for the handful of scalars map.yaml carries (no PyYAML needed)."""
    out: dict = {}
    origin: list[float] = []
    in_origin = False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        if line.startswith("- ") and in_origin:
            origin.append(float(line[2:].strip()))
            continue
        in_origin = False
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if key == "origin":
            in_origin = True
            if val.startswith("["):
                origin = [float(v) for v in val.strip("[]").split(",")]
                in_origin = False
            continue
        out[key] = val
    out["origin"] = origin
    return out


class ClearanceMap:
    """Distance-to-nearest-obstacle lookup over the published occupancy grid."""

    def __init__(self, map_dir: Path = MAP_DIR) -> None:
        meta = _load_yaml_scalars(map_dir / "map.yaml")
        self.res = float(meta["resolution"])
        self.origin_x, self.origin_y = float(meta["origin"][0]), float(meta["origin"][1])
        occ_thresh = float(meta.get("occupied_thresh", 0.65))
        self.w, self.h, maxval, px = _load_p5(map_dir / str(meta.get("image", "map.pgm")))
        # trinary: pixel 0 is fully occupied, maxval is free.
        self._occupied = [
            (r, c)
            for r in range(self.h)
            for c in range(self.w)
            if (maxval - px[r * self.w + c]) / maxval > occ_thresh
        ]
        if not self._occupied:
            raise ValueError("occupancy grid has no occupied cells")
        self._obstacles = [self._cell_centre(r, c) for r, c in self._occupied]

    def _cell_centre(self, row: int, col: int) -> tuple[float, float]:
        # PGM row 0 is the TOP of the image, i.e. world max Y.
        return (
            self.origin_x + (col + 0.5) * self.res,
            self.origin_y + (self.h - 1 - row + 0.5) * self.res,
        )

    def at(self, x: float, y: float) -> float:
        """Distance in metres from (x, y) to the nearest occupied cell centre."""
        return min(math.hypot(ox - x, oy - y) for ox, oy in self._obstacles)

    def profile(self, points) -> dict:
        """Min/mean clearance over a polyline, plus where the worst point is."""
        vals = [(self.at(x, y), x, y) for x, y in points]
        if not vals:
            return {"n": 0, "min": None, "mean": None, "at": None, "n_below_half_width": 0, "n_below_warn": 0}
        worst = min(vals)
        return {
            "n": len(vals),
            "min": round(worst[0], 4),
            "mean": round(sum(v[0] for v in vals) / len(vals), 4),
            "at": [round(worst[1], 3), round(worst[2], 3)],
            "n_below_half_width": sum(1 for v in vals if v[0] < HALF_WIDTH_M),
            "n_below_warn": sum(1 for v in vals if v[0] < WARN_M),
        }


_SHARED: ClearanceMap | None = None


def shared() -> ClearanceMap:
    global _SHARED
    if _SHARED is None:
        _SHARED = ClearanceMap()
    return _SHARED


if __name__ == "__main__":
    cm = shared()
    print(f"grid {cm.w}x{cm.h} res={cm.res} origin=({cm.origin_x}, {cm.origin_y})")
    print(f"half_width={HALF_WIDTH_M} circumscribed={CIRCUMSCRIBED_M:.4f} warn={WARN_M}")
    for name, (x, y) in [
        ("EP-PARKING-A", (-1.743, -0.516)),
        ("EP-INBOUND", (1.747, 1.543)),
        ("pillar squeeze y=-0.84", (-0.75, -0.84)),
        ("corridor centre y=-0.99", (-0.75, -0.99)),
        ("observed CM block", (-0.94, -0.80)),
        ("observed stall", (1.875, 1.625)),
    ]:
        d = cm.at(x, y)
        print(
            f"  {name:24} ({x:+.3f},{y:+.3f}) clearance={d:.3f} "
            f"travel={'OK' if d >= HALF_WIDTH_M else 'FAIL'} "
            f"rotate={'OK' if d >= CIRCUMSCRIBED_M else 'NO'}"
        )
