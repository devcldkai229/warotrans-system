#!/usr/bin/env bash
set +e
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
echo "## mqtt lines"
grep -E 'mqtt=|MQTT |Connected|disconnected|client error' "$LOG" | head -40
echo "## listeners"
ss -ltn | grep 1883 || true
echo "## tcp 127"
timeout 2 bash -c 'echo >/dev/tcp/127.0.0.1/1883' && echo MQTT_127_OK || echo MQTT_127_FAIL
HOSTIP=$(awk '/nameserver/{print $2; exit}' /etc/resolv.conf)
echo "HOSTIP=$HOSTIP"
timeout 2 bash -c "echo >/dev/tcp/${HOSTIP}/1883" && echo MQTT_HOSTIP_OK || echo MQTT_HOSTIP_FAIL
pgrep -af mosquitto | head -5
