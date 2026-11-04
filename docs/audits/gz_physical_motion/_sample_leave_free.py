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
w, h, maxv = map(int, parts)
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


named = [
    ("parking", -1.743, -0.566),
    ("leave_a", -1.55, -0.55),
    ("exit_bad", -1.35, -0.30),
    ("leave_mid", -1.30, -0.25),
    ("leave_b", -1.05, 0.05),
    ("mid", -0.90, 0.10),
    ("south", -1.20, -0.75),
    ("north_mouth", -1.40, -0.20),
    ("ne1", -1.45, -0.40),
    ("ne2", -1.25, -0.15),
    ("ne3", -1.15, 0.00),
]
for name, x, y in named:
    print(name, x, y, sample(x, y))

print("--- along EDGE-LEAVE centerline ---")
ax, ay, bx, by = -1.55, -0.55, -1.05, 0.05
for k in range(21):
    t = k / 20
    x = ax + (bx - ax) * t
    y = ay + (by - ay) * t
    print(f"t={t:.2f}", round(x, 3), round(y, 3), sample(x, y))
