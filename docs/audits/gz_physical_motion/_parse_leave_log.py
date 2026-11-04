#!/usr/bin/env python3
import json
from pathlib import Path

rows = []
for line in Path("/mnt/e/programming/my_project/warotrans-system/debug-100d90.log").read_text().splitlines():
    if "leave-off" not in line or "verify_parking" not in line:
        continue
    rows.append(json.loads(line))
print("n", len(rows))
for r in rows:
    t = r.get("data", {}).get("t")
    if r["message"] != "progress" or (t is not None and int(t) % 8 == 0):
        print(r["message"], json.dumps(r.get("data"))[:280])
