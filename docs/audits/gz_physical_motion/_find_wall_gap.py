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


print("wall strip y=-0.35 and -0.30 across x:")
for y in (-0.35, -0.30):
    occ = []
    for xi in range(-200, 50):
        x = xi / 100
        v = sample(x, y)
        if v is not None and v < 200:
            occ.append(round(x, 2))
    print(f"y={y} occ_x from {occ[0] if occ else None} to {occ[-1] if occ else None} n={len(occ)}")
    # gaps
    gaps = []
    for xi in range(-200, 50):
        x = xi / 100
        v = sample(x, y)
        if v is not None and v >= 200:
            gaps.append(round(x, 2))
    # cluster free
    print("  free samples", gaps[::10][:20])

print("\nfull aisle y=-0.55 to 0.15, x=-1.8..0.2 (.=free #=occ)")
xs = [xx / 20 for xx in range(-36, 5)]
print("x", "".join(f"{int(x*10)%10}" for x in xs))
for yi in range(-11, 4):
    y = yi / 20
    row = []
    for x in xs:
        v = sample(x, y)
        row.append("." if v is not None and v >= 200 else "#")
    print(f"{y:+.2f}", "".join(row))
