#!/usr/bin/env bash
set +e
LOG=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion/bringup_new_map.log
for i in $(seq 1 150); do
  NAV=$(grep -c 'lifecycle_manager_navigation.*Managed nodes are active' "$LOG" 2>/dev/null || true)
  GW=$(grep -c 'traffic_mode=semantic_active' "$LOG" 2>/dev/null || true)
  GW_S=$(grep -c 'Robot gateway started' "$LOG" 2>/dev/null || true)
  if [ "${NAV:-0}" -ge 1 ] && [ "${GW:-0}" -ge 1 ]; then
    echo "READY t=${i}s nav=$NAV gw=$GW gw_s=$GW_S"
    grep -E 'spawn=|robots=|world=' "$LOG" | head -15
    exit 0
  fi
  if [ $((i % 15)) -eq 0 ]; then
    echo "wait t=${i}s nav=$NAV gw=$GW gw_s=$GW_S"
  fi
  sleep 1
done
echo NOT_READY
tail -40 "$LOG"
exit 1
