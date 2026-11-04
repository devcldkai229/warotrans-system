#!/usr/bin/env python3
from pathlib import Path

pgm = Path(
    "/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/maps/map_one_v001/map.pgm"
).read_bytes()
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


print("around stuck (-0.94,-0.66) and pillar:")
xs = [x / 100 for x in range(-110, -45, 5)]
print("x", " ".join(f"{x:.2f}" for x in xs))
for yi in range(-85, -40, 5):
    y = yi / 100
    row = []
    for x in xs:
        v = sample(x, y)
        row.append("." if v is not None and v >= 200 else "#")
    print(f"{y:+.2f}", "".join(row))
