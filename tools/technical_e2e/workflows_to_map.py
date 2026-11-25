"""New PUBLISHED version of each transport workflow whose configured endpoints point at the same endpoint codes on
another map (v2 still pointed at MAP-ONE-V019, archived; the bench runs on MAP-ONE-V021).

    python workflows_to_map.py MAP-ONE-V021 [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from api import Api  # noqa: E402

sys.path.insert(0, r"E:\programming\my_project\warotrans\tools\traffic_e2e")
from real_two_robot_run import sql  # noqa: E402

CODES = ["INBOUND", "OUTBOUND_RETRIEVAL", "INTERNAL_RELOCATION"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_code")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    api = Api()
    code_of = {i: c for i, c in sql("select id, code from navigation.endpoints")}
    target = {c: i for c, i in sql("select e.code, e.id from navigation.endpoints e join navigation.map_versions m "
                                   f"on m.id = e.map_version_id where m.code = '{a.map_code}'")}
    listing = api.host("GET", "/api/workflow-execution/workflows?pageSize=200")
    items = listing.get("items", listing) if isinstance(listing, dict) else listing
    for code in CODES:
        current = max((w for w in items if w["code"] == code and w["status"] == "PUBLISHED"), key=lambda w: w["versionNo"])
        detail = api.host("GET", f"/api/workflow-execution/workflows/{current['id']}")
        changes = []
        for v in detail["variables"]:
            value = v.get("configuredValue")
            if isinstance(value, str) and value in code_of:
                new = target.get(code_of[value])
                if new is None:
                    raise SystemExit(f"{code}.{v['key']}: {code_of[value]} does not exist on {a.map_code}")
                if new != value:
                    changes.append((v["key"], code_of[value], value, new))
                    v["configuredValue"] = new
        print(code, f"v{detail['versionNo']}:", changes or "already on the map")
        if not changes or a.dry_run:
            continue
        draft = api.host("POST", f"/api/workflow-execution/workflows/{current['id']}/versions", {})
        body = {"code": detail["code"], "name": detail["name"], "description": detail.get("description"),
                "variables": detail["variables"],
                "tasks": [{"taskKey": t["taskKey"], "name": t["name"], "sequenceNo": t["sequenceNo"],
                           "runCondition": t.get("runCondition"),
                           "steps": [{k: s[k] for k in ("stepKey", "name", "stepType", "sequenceNo", "operationCode",
                                                        "instructionText", "inputBindings", "timeoutSeconds",
                                                        "maxAttempts", "retryBackoffSeconds", "onFailure")}
                                     for s in t["steps"]]}
                          for t in detail["tasks"]]}
        api.host("PUT", f"/api/workflow-execution/workflows/{draft['id']}", body)
        published = api.host("POST", f"/api/workflow-execution/workflows/{draft['id']}/publish", {})
        print(f"  -> {code} v{published.get('versionNo', '?')} PUBLISHED ({draft['id']})")


if __name__ == "__main__":
    main()
