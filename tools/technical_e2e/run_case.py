"""Technical E2E: one transport request on the real robot, one lab fault, then the AI's own investigation.

    python run_case.py 1            (case numbers from CASES; WARO_PI_PW is not needed: faults go through /api/lab)
    python run_case.py 1 --no-wait-ai

Each run writes artifacts/technical_e2e/<date>/case-NN.json: the request, the lab injection (ground truth, which the
AI never sees), the job's end, the journal (runs, recordings, segments), and the AI case with its diagnosis. The
grading (does the AI's diagnosis match the injected fault?) is done by a person reading that file and the case page.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("WARO_REAL_MAP", "MAP-ONE-V021")
sys.path.insert(0, str(Path(os.environ.get("WARO_TRAFFIC_E2E", r"E:\programming\my_project\warotrans\tools\traffic_e2e"))))
import real_two_robot_run as rr  # noqa: E402

from api import Api, ApiError  # noqa: E402

ROBOT = os.environ.get("WARO_E2E_ROBOT", "RBT-002")
OUT = HERE.parents[1] / "artifacts" / "technical_e2e" / datetime.now().strftime("%Y%m%d")
TERMINAL = {"COMPLETED", "FAILED", "CANCELLED", "PAUSED", "RECOVERY_REQUIRED"}

# kind, source, destination, fault, trigger (when to inject), extra
CASES: dict[int, dict[str, Any]] = {
    1: {"kind": "INBOUND", "dst": "SHELF-A-1", "fault": None},
    2: {"kind": "INBOUND", "dst": "SHELF-A-2", "fault": "IOT-01", "trigger": "move:2"},   # 2nd MOVE actually run
    3: {"kind": "INBOUND", "dst": "SHELF-B-2", "fault": "NAV-01", "trigger": "move:2"},
    4: {"kind": "INBOUND", "dst": "SHELF-C-1", "fault": "OPS-03", "trigger": "human:1", "checkQuality": True},
    5: {"kind": "OUTBOUND", "src": "SHELF-A-1", "fault": "IOT-02", "trigger": "move:2"},
    6: {"kind": "OUTBOUND", "src": "SHELF-A-2", "fault": "NAV-02", "trigger": "move:1"},
    7: {"kind": "OUTBOUND", "src": "SHELF-B-2", "fault": "OPS-02", "trigger": "human:1"},
    8: {"kind": "OUTBOUND", "src": "SHELF-C-1", "fault": "IOT-03", "trigger": "move:1"},
    9: {"kind": "RELOC", "src": "SHELF-A-1", "dst": "SHELF-B-2", "fault": "MAP-01", "trigger": "move:2"},
    10: {"kind": "RELOC", "src": "SHELF-B-2", "dst": "SHELF-C-1", "fault": "TRA-01", "trigger": "move:2"},
    11: {"kind": "RELOC", "src": "SHELF-C-1", "dst": "SHELF-A-2", "fault": "OPS-04", "trigger": "move:1"},
    12: {"kind": "RELOC", "src": "SHELF-A-2", "dst": "SHELF-A-1", "fault": "OPS-01", "trigger": "move:2"},
}


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def create(w: rr.World, case: dict[str, Any], tag: str) -> tuple[str, str, str]:
    kind = case["kind"]
    if kind == "INBOUND":
        c = rr.new_containers(w, 1, tag)
        rr.voucher(w, "INBOUND", c, f"technical e2e {tag}")
        moves = [{"container": c[0], "src": "EP-INBOUND", "dst": w.loc_ep[case["dst"]], "dstLoc": case["dst"]}]
        workflow = "INBOUND"
    elif kind == "OUTBOUND":
        c = [rr.stored_at(w, case["src"])]
        try:  # an outbound trip needs a confirmed outbound voucher
            rr.voucher(w, "OUTBOUND", c, f"technical e2e {tag}")
        except AssertionError as exc:  # a rerun: the container already sits on the voucher of a broken try
            if "voucher_container_on_other_voucher" not in str(exc):
                raise
        moves = [{"container": c[0], "src": w.loc_ep[case["src"]], "srcLoc": case["src"], "dst": "EP-OUTBOUND"}]
        workflow = "OUTBOUND_RETRIEVAL"
    else:
        c = [rr.stored_at(w, case["src"])]
        moves = [{"container": c[0], "src": w.loc_ep[case["src"]], "srcLoc": case["src"],
                  "dst": w.loc_ep[case["dst"]], "dstLoc": case["dst"]}]
        workflow = "INTERNAL_RELOCATION"
    details = []
    for i, m in enumerate(moves):
        d = {"sequenceNo": i + 1, "containerId": m["container"], "sourceEndpointId": w.eps[m["src"]][0],
             "destinationEndpointId": w.eps[m["dst"]][0]}
        if m.get("srcLoc"):
            d["sourceStorageLocationId"] = w.locs[m["srcLoc"]]
        if m.get("dstLoc"):
            d["destinationStorageLocationId"] = w.locs[m["dstLoc"]]
        details.append(d)
    inputs = {"checkQuality": bool(case.get("checkQuality"))}   # every transport workflow asks it (STAFF_INPUT)
    tr = w.api.call("POST", "/api/transportation/transport-requests", {
        "warehouseId": w.warehouse, "mapVersionId": w.map_id, "workflowId": w.wf[workflow], "workflowInputs": inputs,
        "note": f"technical e2e {tag}", "details": details})["id"]
    jobs = [j["jobId"] for j in w.api.call("POST", f"/api/transportation/transport-requests/{tr}/queue", {})["jobs"]]
    rr.dispatch(w, jobs[0], ROBOT)
    code = w.api.call("GET", f"/api/transportation/transport-requests/{tr}").get("requestCode")
    return tr, code, jobs[0]


def steps(j: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for t in sorted(j["tasks"], key=lambda t: t["sequenceNo"]) for s in sorted(t["steps"], key=lambda s: s["sequenceNo"])]


def triggered(trigger: str, j: dict[str, Any]) -> bool:
    """move:N = the N-th MOVE is executing; human:N = the N-th staff step is waiting."""
    kind, n = trigger.split(":")
    wanted = "MOVE" if kind == "move" else "HUMAN_INTERACTION"
    state = "EXECUTING" if kind == "move" else "WAITING"
    of_kind = [s for s in steps(j) if s.get("stepType") == wanted and s["status"] != "SKIPPED"]
    return len(of_kind) >= int(n) and of_kind[int(n) - 1]["status"] == state


def confirm(w: rr.World, j: dict[str, Any], wrong_barcode: str | None = None) -> list[str]:
    done = []
    for s in steps(j):
        if s["status"] != "WAITING" or s.get("stepType") != "HUMAN_INTERACTION":
            continue
        container = (s.get("resolvedInputs") or {}).get("containerId") or (
            j["containers"][0]["containerId"] if j.get("containers") else None)
        if not container:
            continue
        body: dict[str, Any] = {"containerId": container, "note": "technical e2e staff"}
        if "INSPECTION" in str(s.get("stepKey")):
            body["inspectionResult"] = "PASSED"
        if wrong_barcode:
            try:
                w.api.call("POST", f"/api/workflow-execution/job-steps/{s['id']}/confirm",
                           {**body, "scannedBarcode": wrong_barcode})
                done.append("WRONG SCAN ACCEPTED (unexpected)")
            except Exception as e:  # noqa: BLE001 - expected: handover_barcode_mismatch
                done.append(f"wrong scan refused: {str(e)[:120]}")
        w.api.call("POST", f"/api/workflow-execution/job-steps/{s['id']}/confirm", body)
        done.append(f"confirmed {s.get('name')}")
    return done


def other_barcode(w: rr.World, not_container: str) -> str:
    rows = rr.sql("select barcode from warehouse.containers where barcode is not null "
                  f"and id <> '{not_container}' order by created_at desc limit 1")
    return rows[0][0]


def run(n: int, wait_ai: bool, ai_timeout: float) -> dict[str, Any]:
    case = CASES[n]
    tag = f"E2E-{n:02d}-{case['fault'] or 'CTRL'}"
    api, w = Api(), rr.World()
    started = datetime.now(UTC)
    tr, code, job_id = create(w, case, tag)
    log(f"case {n} {tag}: TR {code} job {job_id[:8]} on {ROBOT}")
    record: dict[str, Any] = {"case": n, "tag": tag, "spec": case, "robot": ROBOT, "transportRequestId": tr,
                              "requestCode": code, "jobId": job_id, "startedAt": started.isoformat(), "events": []}
    injected: dict[str, Any] | None = None
    hold_confirm_until = 0.0
    wrong_scan_pending = case["fault"] == "OPS-02"
    t0 = time.time()
    last = ""
    j: dict[str, Any] = {}
    while time.time() - t0 < 1500:
        j = w.api.call("GET", f"/api/workflow-execution/jobs/{job_id}")
        line = f"{j['status']} {j['completedSteps']}/{j['totalSteps']} {j.get('blockingReason') or ''}"
        if line != last:
            log(f"  {line}")
            record["events"].append({"t": round(time.time() - t0, 1), "job": line})
            last = line
        if case["fault"] and injected is None and triggered(case["trigger"], j):
            injected = inject(api, case, tr)
            record["injection"] = injected
            record["events"].append({"t": round(time.time() - t0, 1), "inject": case["fault"]})
            if case["fault"] == "OPS-03":
                hold_confirm_until = time.time() + 200      # nobody comes to the handover for 200 s
            if case["fault"] == "OPS-01":
                log("  >>> OPS-01: restart the Host now (the runner keeps polling and waits for it)")
        if j["status"] in TERMINAL:
            break
        if time.time() >= hold_confirm_until:
            wrong = None
            if wrong_scan_pending and injected is not None:
                cont = next((s.get("resolvedInputs", {}).get("containerId") for s in steps(j)
                             if s["status"] == "WAITING" and s.get("stepType") == "HUMAN_INTERACTION"), None)
                if cont:
                    wrong = other_barcode(w, cont)
                    wrong_scan_pending = False
            for msg in confirm(w, j, wrong):
                log(f"  {msg}")
                record["events"].append({"t": round(time.time() - t0, 1), "staff": msg})
        time.sleep(1.0)
    if injected is not None and injected.get("id"):
        # A fault outliving its trip leaks into the next case (lab 2026-11-25: IOT-03's clock offset showed as a
        # CLOCK_JUMP in case 9): it ends with the trip.
        try:
            api.host("POST", f"/api/lab/injections/{injected['id']}/stop", {})
        except Exception as exc:  # noqa: BLE001 - already expired
            log(f"  lab stop: {str(exc)[:120]}")
    record["job"] = {k: j.get(k) for k in ("jobNo", "status", "failureCode", "failureMessage", "completedSteps", "totalSteps")}
    record["endedAt"] = datetime.now(UTC).isoformat()
    log(f"case {n}: job {record['job']}")
    record["journal"] = journal(api, tr)
    if wait_ai:
        record["ai"] = wait_case(api, record["journal"].get("id"), ai_timeout)
    # Telemetry batches and video segments keep arriving after the trip: read the journal again at the end.
    record["journal"] = journal(api, tr)
    # The bench needs the robot back: a trip the fault left PAUSED / RECOVERY_REQUIRED is a test job, cancelled.
    final = w.api.call("GET", f"/api/workflow-execution/jobs/{job_id}")
    if final["status"] not in ("COMPLETED", "FAILED", "CANCELLED"):
        w.api.call("POST", f"/api/workflow-execution/jobs/{job_id}/cancel",
                   {"reason": f"technical E2E {tag}: test job left {final['status']} by the injected fault"})
        log(f"  test job {final['jobNo']} ({final['status']}) cancelled to free the robot")
        record["cleanup"] = f"cancelled from {final['status']}"
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"case-{n:02d}.json"
    path.write_text(json.dumps(record, indent=1, default=str), encoding="utf-8")
    log(f"case {n}: written {path}")
    return record


def inject(api: Api, case: dict[str, Any], tr: str) -> dict[str, Any]:
    params: dict[str, str] = {}
    if case["fault"] == "TRA-01":
        # A phantom on the robot's way to its drop-off: the middle of the destination shelf's approach.
        x, y = {"SHELF-C-1": (1.04, -1.20), "SHELF-B-2": (1.28, 0.75), "SHELF-A-1": (-0.60, 0.80)}[case["dst"]]
        params = {"x": f"{x}", "y": f"{y}", "r": "0.30"}
    body = {"scenarioId": case["fault"], "robotCode": ROBOT, "transportRequestId": tr, "parameters": params}
    res = api.host("POST", "/api/lab/injections", body)
    log(f"  LAB {case['fault']} injected ({res['executor']}, ends {res['expiresAt']})")
    return res


def journal(api: Api, tr: str) -> dict[str, Any]:
    for _ in range(30):
        try:
            j = api.recorder("GET", f"/journals/by-transport-request/{tr}")
            break
        except ApiError:
            time.sleep(2)
    else:
        return {}
    replay = api.recorder("GET", f"/journals/{j['id']}/replay")
    runs = []
    for r in replay.get("runs", []):
        recs = r.get("recordings") or []
        runs.append({"id": r.get("id"), "robot": r.get("robotCode"), "status": r.get("sourceRunStatus"),
                     "trajectory": r.get("trajectoryAvailable"), "plans": r.get("planCount"),
                     "recordings": len(recs),
                     "segments": sum(len(x.get("segments") or x.get("assets") or []) for x in recs)})
    events = api.recorder("GET", f"/journals/{j['id']}/events")
    return {"id": j["id"], "status": replay.get("evidenceStatus"), "runs": runs, "events": len(events),
            "labEvents": [e["message"] for e in events if str(e.get("eventType", "")).startswith("lab.")]}


def wait_case(api: Api, journal_id: str | None, timeout: float) -> dict[str, Any]:
    """The worker opens the case and investigates once the journal settles; wait for a finished investigation."""
    if not journal_id:
        return {"error": "no journal"}
    t0 = time.time()
    seen = None
    while time.time() - t0 < timeout:
        cases = [c for c in api.ai("GET", "/cases")["items"] if c.get("journal_id") == journal_id]
        if cases:
            c = max(cases, key=lambda c: c["created_at"])
            if c["id"] != seen:
                log(f"  AI case {c['id']} {c['status']} {c['detector_codes']}")
                seen = c["id"]
            if c["status"] not in ("DETECTED", "REOPENED", "INVESTIGATING"):
                view = api.ai("GET", f"/cases/{c['id']}")
                return {"caseId": c["id"], "status": c["status"], "detectors": c["detector_codes"],
                        "robots": c["robots"], "view": view}
        time.sleep(10)
    return {"error": f"no finished AI case within {timeout:.0f} s", "caseId": seen}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cases", type=int, nargs="+")
    ap.add_argument("--no-wait-ai", action="store_true")
    ap.add_argument("--ai-timeout", type=float, default=600)
    a = ap.parse_args()
    for n in a.cases:
        run(n, not a.no_wait_ai, a.ai_timeout)


if __name__ == "__main__":
    main()
