"""Print an AI case for grading: detectors, diagnosis, hypotheses, resolution, cited evidence, cost."""
import json
import sys

from api import Api

a = Api()
v = a.ai("GET", f"/cases/{sys.argv[1]}")
c = v["case"]
print("CASE", c["id"], c["status"], "|", c["title"], "| robots", c["robots"], "| detectors", c["detector_codes"])
r = v.get("result") or {}
d = r.get("diagnosis") or {}
print("OWNER", d.get("owner"), "| SEVERITY", d.get("severity"))
print("SUMMARY", d.get("reasoning_summary"))
for h in (d.get("hypotheses") or [])[:3]:
    print(" H:", h.get("title"), "|", h.get("subsystem"), "| supports", (h.get("supports") or [])[:4])
res = r.get("resolution") or {}
print("RESOLUTION", res.get("owner"), "|", res.get("summary"))
if res.get("technician"):
    for s in res["technician"]["checklist"][:5]:
        print("  -", s["instruction"])
if res.get("engineering"):
    print("  ENG", res["engineering"].get("title"), "|", res["engineering"].get("suspected_module"))
print("RUNS", [(x["status"], round(x["cost_usd"], 4)) for x in v["runs"]])
print("MISSING", v["evidence"].get("missing"))
