#!/usr/bin/env bash
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
echo "connected=$(grep -c 'MQTT connected' "$LOG" || true)"
echo "disconnected=$(grep -c 'MQTT disconnected' "$LOG" || true)"
echo "client_error=$(grep -c 'MQTT client error' "$LOG" || true)"
grep 'MQTT connected' "$LOG" | head -5
