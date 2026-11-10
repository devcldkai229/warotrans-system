#!/usr/bin/env python3
"""Find free NE bypass around wall blob on EDGE-LEAVE centerline."""
from pathlib import Path

pgm_path = Path(
    "/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/maps/map_one_v001/map.pgm"
)
pgm = pgm_path.read_bytes()
i = 2
while pgm[i] in b" \t\n\r":
    i += 1
while True:
    if pgm[i : i + 1] == b"#":
        while pgm[i] not in b"\n\r":
            i += 1
        while pgm[i] in b" \t\n\r":
            i += 1
        continue
    break
parts = []
while len(parts) < 3:
    while pgm[i] in b" \t\n\r":
        i += 1
    if pgm[i : i + 1] == b"#":
        while pgm[i] not in b"\n\r":
            i += 1
        continue
    j = i
    while pgm[j] not in b" \t\n\r":
        j += 1
    parts.append(pgm[i:j])
    i = j
w, h, _ = map(int, parts)
while pgm[i] in b" \t\r":
    i += 1
if pgm[i : i + 1] == b"\n":
    i += 1
data = pgm[i : i + w * h]
ox, oy, res = -2.929, -1.415, 0.05


def sample(x: float, y: float):
    col = int((x - ox) / res)
    row_from_bottom = int((y - oy) / res)
    rr = h - 1 - row_from_bottom
    if not (0 <= col < w and 0 <= rr < h):
        return None
    return int(data[rr * w + col])


print("grid around wall blob x=-1.45..-1.20 y=-0.50..-0.10 (254=free 0=occ)")
for y in [yy / 100 for yy in range(-50, -5, 5)]:
    row = []
    for x in [xx / 100 for xx in range(-160, -110, 5)]:
        v = sample(x, y)
        row.append("." if v and v >= 200 else "#")
    print(f"y={y:+.2f}", "".join(row), f"x={-1.60:.2f}..{-1.15:.2f}")

# candidate exit points north of blob
cands = [
    (-1.45, -0.40),
    (-1.40, -0.37),
    (-1.40, -0.20),
    (-1.35, -0.15),
    (-1.30, -0.25),
    (-1.30, -0.10),
    (-1.25, -0.05),
    (-1.20, 0.00),
    (-1.15, 0.05),
    (-1.05, 0.05),
    (-0.95, 0.10),
    (-0.90, 0.10),
]
print("--- candidates ---")
for x, y in cands:
    print(x, y, sample(x, y))
