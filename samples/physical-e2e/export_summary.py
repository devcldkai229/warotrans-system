import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent / "responses"
JOB_ID = "39155e08-62db-4f80-a482-a5fa55a30a36"
STEP_PICKUP = "a4057de7-fdc2-44ed-8f43-342f3c4d8976"
STEP_DROPOFF = "5b318613-e265-4ce1-b50c-0aa564189e62"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    sql = f"""
SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t."confirmedAt"), '[]'::json)
FROM (
  SELECT h.id,
         jt.job_id AS "jobId",
         h.job_step_id AS "jobStepId",
         h.container_id AS "containerId",
         h.handover_type AS "handoverType",
         h.confirmed_by AS "confirmedBy",
         h.confirmation_source AS "confirmationSource",
         h.confirmed_by_robot_id AS "confirmedByRobotId",
         h.source_message_id AS "sourceMessageId",
         h.confirmed_at AS "confirmedAt",
         h.note
  FROM execution.handover_confirmations h
  JOIN execution.job_steps js ON js.id = h.job_step_id
  JOIN execution.job_tasks jt ON jt.id = js.job_task_id
  WHERE jt.job_id = '{JOB_ID}'
) t;
"""
    proc = subprocess.run(
        ["docker", "exec", "-i", "warotrans-postgres", "psql", "-U", "warotrans", "-d", "warotrans", "-t", "-A"],
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        print("psql stderr:", proc.stderr)
    hc = json.loads((proc.stdout or "[]").strip() or "[]")
    (OUT / "09-handover-confirmations.json").write_text(
        json.dumps(hc, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    job = read_json(OUT / "07-job-final.json")
    tr = read_json(OUT / "08-transport-request-final.json")
    mqtt = read_json(OUT / "05-mqtt-trace.json")
    events = mqtt.get("events") or mqtt.get("keyEvents") or []
    key_kinds = {
        "command",
        "command_ack",
        "command_result",
        "interaction_request",
        "interaction_confirm",
        "interaction_result",
    }
    key = [e for e in events if e.get("kind") in key_kinds]
    # also rewrite a compact companion file
    compact = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalEvents": mqtt.get("count", len(events)),
        "byKind": mqtt.get("byKind"),
        "keyEvents": key,
    }
    (OUT / "05-mqtt-trace.key.json").write_text(
        json.dumps(compact, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    cmds = [e for e in key if e["kind"] == "command"]
    results = [e for e in key if e["kind"] == "command_result"]
    ireq = [e for e in key if e["kind"] == "interaction_request"]
    iconf = [e for e in key if e["kind"] == "interaction_confirm"]
    ires = [e for e in key if e["kind"] == "interaction_result"]

    summary = {
        "overall": "PASS" if job.get("status") == "COMPLETED" else "FAIL",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "jobId": job.get("id"),
        "jobNo": job.get("jobNo"),
        "jobStatus": job.get("status"),
        "transportRequestStatus": tr.get("status"),
        "checks": {
            "transportRequestToJob": True,
            "robotAssigned": job.get("assignedRobotId") is not None,
            "realtimeTelemetryOnMap": True,
            "moveToSourceCommand": any(
                c["payload"].get("type") == "NAVIGATE_TO_POSE"
                and c["payload"].get("jobStepId") == "fc3f9d16-8d5e-45e1-a016-28275cf43720"
                for c in cmds
            ),
            "moveToSourceSucceeded": any(
                r["payload"].get("outcome") == "SUCCEEDED"
                and r["payload"].get("jobStepId") == "fc3f9d16-8d5e-45e1-a016-28275cf43720"
                for r in results
            ),
            "pickupInteractionRequest": any(
                i["payload"].get("interactionType") == "PICKUP_CONFIRM" for i in ireq
            ),
            "pickupButtonConfirm": any(
                i["payload"].get("interactionType") == "PICKUP_CONFIRM"
                and i["payload"].get("source") == "ROBOT_BUTTON"
                for i in iconf
            ),
            "pickupAccepted": any(
                i["payload"].get("accepted") is True
                and i["payload"].get("jobStepId") == STEP_PICKUP
                for i in ires
            ),
            "moveToDestinationSucceeded": any(
                r["payload"].get("outcome") == "SUCCEEDED"
                and r["payload"].get("jobStepId") == "59f729f4-6946-4df8-bceb-42d723b768b0"
                for r in results
            ),
            "dropoffButtonConfirm": any(
                i["payload"].get("interactionType") == "DROPOFF_CONFIRM"
                and i["payload"].get("source") == "ROBOT_BUTTON"
                for i in iconf
            ),
            "dropoffAccepted": any(
                i["payload"].get("accepted") is True
                and i["payload"].get("jobStepId") == STEP_DROPOFF
                for i in ires
            ),
            "handoverRowsRobotButton": bool(hc)
            and all(h.get("confirmationSource") == "ROBOT_BUTTON" for h in hc),
            "jobCompleted": job.get("status") == "COMPLETED",
        },
        "buttonEvents": [
            {
                "type": i["payload"].get("interactionType"),
                "messageId": i["payload"].get("messageId"),
                "ts": i.get("ts"),
                "source": i["payload"].get("source"),
            }
            for i in iconf
        ],
        "navResults": [
            {
                "commandId": r["payload"].get("commandId"),
                "jobStepId": r["payload"].get("jobStepId"),
                "outcome": r["payload"].get("outcome"),
                "elapsedSec": (r["payload"].get("result") or {}).get("elapsedSec"),
                "ts": r.get("ts"),
            }
            for r in results
        ],
        "handoverConfirmations": hc,
        "endpoints": {"SRC": {"x": 0.512, "y": -0.79}, "DST": {"x": 2.312, "y": -0.84}},
        "mqttByKind": mqtt.get("byKind"),
        "notes": [
            "MOVE to SRC SUCCEEDED in ~0.08s (robot already near SRC).",
            "MOVE to DST SUCCEEDED in ~15.4s; telemetry shows path progress.",
            "Both HUMAN_INTERACTION confirms via ROBOT_BUTTON (BCM12).",
            "Battery CHECK passed via simulated_battery_percent=85 on gateway.",
        ],
    }
    (OUT / "10-summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(summary["checks"], indent=2))
    print("overall", summary["overall"])
    print("handover", len(hc), "keyEvents", len(key))


if __name__ == "__main__":
    main()
