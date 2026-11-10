#!/usr/bin/env python3
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


def sample(x, y):
    col = int((x - ox) / res)
    row_from_bottom = int((y - oy) / res)
    rr = h - 1 - row_from_bottom
    if not (0 <= col < w and 0 <= rr < h):
        return None
    return int(data[rr * w + col])


print("east aisle at y=-0.55:")
for x in [xx / 100 for xx in range(-175, -80, 5)]:
    print(round(x, 2), sample(x, -0.55), sample(x, -0.50), sample(x, -0.45))

print("\nnorth after clearing wall x>=-1.10:")
for y in [yy / 100 for yy in range(-55, 20, 5)]:
    print(f"y={y:+.2f}", "x-1.10", sample(-1.10, y), "x-1.00", sample(-1.00, y), "x-0.90", sample(-0.90, y))

print("\nproposed WPs:")
for p in [
    (-1.55, -0.55),
    (-1.25, -0.55),
    (-1.10, -0.50),
    (-1.10, -0.20),
    (-1.05, 0.05),
    (-0.90, 0.10),
]:
    print(p, sample(*p))
