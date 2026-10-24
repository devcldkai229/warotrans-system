"""Subscribe to RBT-001 MQTT topics and append JSONL + periodic summary JSON."""
from __future__ import annotations

import json
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import paho.mqtt.client as mqtt
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "paho-mqtt", "-q"])
    import paho.mqtt.client as mqtt

OUT = Path(__file__).resolve().parent / "responses"
OUT.mkdir(parents=True, exist_ok=True)
JSONL = OUT / "05-mqtt-trace.jsonl"
SUMMARY = OUT / "05-mqtt-trace.json"

HOST = "127.0.0.1"
PORT = 1883
PREFIX = "warotrans/v1/robots/RBT-001"

events: list[dict] = []
lock = threading.Lock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def classify(topic: str) -> str:
    leaf = topic.rsplit("/", 1)[-1]
    return leaf


def on_message(_c, _u, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        payload = {"_raw": msg.payload.decode("utf-8", errors="replace")}
    ev = {
        "ts": utc_now(),
        "topic": msg.topic,
        "kind": classify(msg.topic),
        "payload": payload,
    }
    with lock:
        events.append(ev)
        with JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    kind = ev["kind"]
    if kind in (
        "command",
        "command_ack",
        "command_result",
        "interaction_request",
        "interaction_confirm",
        "interaction_result",
    ):
        print(f"[{ev['ts']}] {kind}: {json.dumps(payload, ensure_ascii=False)[:240]}", flush=True)
        if kind == "interaction_request":
            print("\n*** ROBOT ARMED — nhấn nút BCM12 1 lần khi sẵn sàng ***\n", flush=True)
        if kind == "interaction_confirm":
            mid = payload.get("messageId") or payload.get("id")
            print(f"\n*** ĐÃ NHẬN TÍN HIỆU NÚT (interaction_confirm) messageId={mid} ***\n", flush=True)
        if kind == "interaction_result":
            print(
                f"\n*** interaction_result status={payload.get('status') or payload.get('result')} ***\n",
                flush=True,
            )


def write_summary():
    with lock:
        by = {}
        for e in events:
            by.setdefault(e["kind"], []).append(e)
        summary = {
            "generatedAt": utc_now(),
            "count": len(events),
            "byKind": {k: len(v) for k, v in by.items()},
            "events": events,
        }
        SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")


def main():
    if JSONL.exists():
        JSONL.write_text("", encoding="utf-8")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="physical-e2e-trace")
    client.on_message = on_message
    client.connect(HOST, PORT, 60)
    client.subscribe(f"{PREFIX}/#", qos=1)
    print(f"subscribed {PREFIX}/# on {HOST}:{PORT}", flush=True)
    client.loop_start()
    try:
        while True:
            time.sleep(2)
            write_summary()
    except KeyboardInterrupt:
        pass
    finally:
        write_summary()
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
