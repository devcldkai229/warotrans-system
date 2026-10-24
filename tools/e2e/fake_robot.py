#!/usr/bin/env python3
"""Virtual MQTT robot for WaroTrans Host E2E (no ROS / Gazebo required).

Publishes heartbeat (1 Hz) + telemetry (5 Hz, LOCALIZED). On NAVIGATE_TO_POSE:
ACK accepted, wait ~travel_seconds, move pose to target, publish command_result SUCCEEDED.

With --auto-confirm-delay: on interaction_request, wait then publish interaction_confirm
(simulates the physical HUMAN_CONFIRM button).
"""

from __future__ import annotations

import argparse
import json
import threading
import time
import uuid
from datetime import datetime, timezone

try:
    import paho.mqtt.client as mqtt
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Install paho-mqtt: pip install paho-mqtt") from exc


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class FakeRobot:
    def __init__(
        self,
        *,
        host: str,
        port: int,
        robot_code: str,
        map_version_code: str | None,
        travel_seconds: float,
        start_x: float,
        start_y: float,
        start_yaw: float,
        battery_percent: float | None,
        auto_confirm_delay: float | None,
    ) -> None:
        self.host = host
        self.port = port
        self.robot_code = robot_code
        self.map_version_code = map_version_code
        self.travel_seconds = travel_seconds
        self.battery_percent = battery_percent
        self.auto_confirm_delay = auto_confirm_delay
        self.boot_id = str(uuid.uuid4())
        self._hb_seq = 0
        self._tel_seq = 0
        self._ix_seq = 0
        self._lock = threading.Lock()
        self.pose = {"x": start_x, "y": start_y, "yaw": start_yaw}
        self.navigation_status = "IDLE"
        self.current_command_id: str | None = None
        self._active_cancel: threading.Event | None = None
        self._seen_commands: set[str] = set()
        self._completed: set[str] = set()
        self._armed_step: str | None = None

        self.base = f"warotrans/v1/robots/{robot_code}"
        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"fake-robot-{robot_code}-{uuid.uuid4().hex[:8]}",
        )
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

    def start(self) -> None:
        self.client.connect(self.host, self.port, keepalive=30)
        self.client.loop_start()
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()
        threading.Thread(target=self._telemetry_loop, daemon=True).start()
        print(
            f"[fake_robot] {self.robot_code} → mqtt://{self.host}:{self.port} "
            f"(LOCALIZED, travel={self.travel_seconds}s, auto_confirm={self.auto_confirm_delay})",
            flush=True,
        )

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def _on_connect(self, client, _userdata, _flags, reason_code, _properties=None) -> None:
        if reason_code != 0 and str(reason_code) not in ("Success", "0"):
            print(f"[fake_robot] connect failed: {reason_code}", flush=True)
            return
        client.subscribe(f"{self.base}/command", qos=1)
        client.subscribe(f"{self.base}/interaction_request", qos=1)
        client.subscribe(f"{self.base}/interaction_result", qos=1)
        print(f"[fake_robot] subscribed command + interaction_*", flush=True)

    def _on_message(self, _client, _userdata, msg) -> None:
        try:
            body = json.loads(msg.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            print(f"[fake_robot] bad payload: {exc}", flush=True)
            return
        topic = msg.topic
        if topic.endswith("/command"):
            cmd_type = body.get("type")
            if cmd_type == "NAVIGATE_TO_POSE":
                threading.Thread(target=self._handle_navigate, args=(body,), daemon=True).start()
            elif cmd_type == "CANCEL":
                self._handle_cancel(body)
        elif topic.endswith("/interaction_request"):
            threading.Thread(target=self._handle_interaction_request, args=(body,), daemon=True).start()
        elif topic.endswith("/interaction_result"):
            accepted = body.get("accepted")
            print(
                f"[fake_robot] interaction_result accepted={accepted} reason={body.get('reasonCode')}",
                flush=True,
            )
            if accepted:
                with self._lock:
                    self._armed_step = None

    def _publish(self, suffix: str, payload: dict, qos: int = 0) -> None:
        self.client.publish(f"{self.base}/{suffix}", json.dumps(payload, separators=(",", ":")), qos=qos)

    def _ack(self, command_id: str, accepted: bool, reason_code: str | None = None) -> None:
        self._publish(
            "command_ack",
            {
                "schemaVersion": 1,
                "messageId": str(uuid.uuid4()),
                "commandId": command_id,
                "robotCode": self.robot_code,
                "accepted": accepted,
                "reasonCode": reason_code,
                "sentAt": utc_now(),
            },
            qos=1,
        )

    def _result(self, command_id: str, outcome: str, error_code: str | None = None) -> None:
        self._publish(
            "command_result",
            {
                "schemaVersion": 1,
                "messageId": str(uuid.uuid4()),
                "commandId": command_id,
                "robotCode": self.robot_code,
                "outcome": outcome,
                "errorCode": error_code,
                "sentAt": utc_now(),
            },
            qos=1,
        )

    def _handle_interaction_request(self, body: dict) -> None:
        step = body.get("jobStepId")
        itype = body.get("interactionType")
        print(f"[fake_robot] INTERACTION_ARMED type={itype} jobStepId={step}", flush=True)
        with self._lock:
            self._armed_step = step
        if self.auto_confirm_delay is None:
            return
        time.sleep(self.auto_confirm_delay)
        with self._lock:
            if self._armed_step != step:
                return
            self._ix_seq += 1
            seq = self._ix_seq
        payload = {
            "schemaVersion": 1,
            "messageId": str(uuid.uuid4()),
            "robotCode": self.robot_code,
            "bootId": self.boot_id,
            "sequence": seq,
            "sentAt": utc_now(),
            "jobId": body.get("jobId"),
            "jobStepId": step,
            "interactionType": itype,
            "containerId": body.get("containerId"),
            "endpointId": body.get("endpointId"),
            "source": "ROBOT_BUTTON",
        }
        self._publish("interaction_confirm", payload, qos=1)
        print(f"[fake_robot] INTERACTION_CONFIRM_PUBLISHED messageId={payload['messageId']}", flush=True)

    def _handle_navigate(self, body: dict) -> None:
        command_id = body["commandId"]
        with self._lock:
            if command_id in self._completed or command_id in self._seen_commands:
                self._ack(command_id, True, "ALREADY_ACCEPTED")
                return
            if self.current_command_id is not None:
                self._ack(command_id, False, "BUSY")
                return
            payload = body.get("payload") or {}
            try:
                x = float(payload["x"])
                y = float(payload["y"])
                yaw = float(payload.get("yaw", 0.0))
            except (KeyError, TypeError, ValueError):
                self._ack(command_id, False, "INVALID_PAYLOAD")
                return
            self._seen_commands.add(command_id)
            self.current_command_id = command_id
            self.navigation_status = "NAVIGATING"
            cancel_event = threading.Event()
            self._active_cancel = cancel_event

        self._ack(command_id, True, None)
        print(f"[fake_robot] NAVIGATE accepted {command_id[:8]}… → ({x:.2f},{y:.2f})", flush=True)

        if cancel_event.wait(self.travel_seconds):
            with self._lock:
                self.navigation_status = "CANCELED"
                self.current_command_id = None
                self._active_cancel = None
                self._completed.add(command_id)
            self._result(command_id, "CANCELED")
            with self._lock:
                self.navigation_status = "IDLE"
            return

        with self._lock:
            self.pose = {"x": x, "y": y, "yaw": yaw}
            self.navigation_status = "SUCCEEDED"
            self.current_command_id = None
            self._active_cancel = None
            self._completed.add(command_id)
        self._result(command_id, "SUCCEEDED")
        print(f"[fake_robot] NAVIGATE succeeded {command_id[:8]}…", flush=True)
        time.sleep(0.2)
        with self._lock:
            if self.navigation_status == "SUCCEEDED":
                self.navigation_status = "IDLE"

    def _handle_cancel(self, body: dict) -> None:
        command_id = body["commandId"]
        target = (body.get("payload") or {}).get("targetCommandId")
        with self._lock:
            if target != self.current_command_id or self._active_cancel is None:
                self._ack(command_id, False, "UNKNOWN_TARGET")
                return
            self._active_cancel.set()
        self._ack(command_id, True, None)

    def _heartbeat_loop(self) -> None:
        while True:
            self._hb_seq += 1
            self._publish(
                "heartbeat",
                {
                    "schemaVersion": 1,
                    "messageId": str(uuid.uuid4()),
                    "robotCode": self.robot_code,
                    "bootId": self.boot_id,
                    "sequence": self._hb_seq,
                    "sentAt": utc_now(),
                },
            )
            time.sleep(1.0)

    def _telemetry_loop(self) -> None:
        while True:
            with self._lock:
                pose = dict(self.pose)
                nav = self.navigation_status
                cmd = self.current_command_id
            self._tel_seq += 1
            self._publish(
                "telemetry",
                {
                    "schemaVersion": 1,
                    "messageId": str(uuid.uuid4()),
                    "robotCode": self.robot_code,
                    "bootId": self.boot_id,
                    "sequence": self._tel_seq,
                    "sentAt": utc_now(),
                    "mapVersionCode": self.map_version_code,
                    "pose": pose,
                    "batteryPercent": self.battery_percent,
                    "navigationStatus": nav,
                    "localizationStatus": "LOCALIZED",
                    "linearVelocity": 0.2 if nav == "NAVIGATING" else 0.0,
                    "angularVelocity": 0.0,
                    "currentCommandId": cmd,
                    "errorCode": None,
                },
            )
            time.sleep(0.2)


def main() -> None:
    parser = argparse.ArgumentParser(description="WaroTrans fake MQTT robot for E2E")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--code", default="RBT-SIM-01")
    parser.add_argument("--map-version-code", default=None)
    parser.add_argument("--travel-seconds", type=float, default=2.0)
    parser.add_argument("--battery", type=float, default=85.0, help="use -1 for null")
    parser.add_argument(
        "--auto-confirm-delay",
        type=float,
        default=None,
        help="seconds after interaction_request before publishing interaction_confirm",
    )
    parser.add_argument("--x", type=float, default=0.0)
    parser.add_argument("--y", type=float, default=0.0)
    parser.add_argument("--yaw", type=float, default=0.0)
    args = parser.parse_args()
    battery = None if args.battery < 0 else float(args.battery)

    robot = FakeRobot(
        host=args.host,
        port=args.port,
        robot_code=args.code,
        map_version_code=args.map_version_code,
        travel_seconds=args.travel_seconds,
        start_x=args.x,
        start_y=args.y,
        start_yaw=args.yaw,
        battery_percent=battery,
        auto_confirm_delay=args.auto_confirm_delay,
    )
    robot.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[fake_robot] stopping", flush=True)
        robot.stop()


if __name__ == "__main__":
    main()
