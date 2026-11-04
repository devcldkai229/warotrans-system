#!/usr/bin/env bash
set +e
# Kill orphan fleet/sim nodes without matching this script name.
while read -r pid; do
  [ -n "$pid" ] || continue
  kill -9 "$pid" 2>/dev/null
done < <(pgrep -f '/warotrans_fleet/' || true)
while read -r pid; do
  [ -n "$pid" ] || continue
  kill -9 "$pid" 2>/dev/null
done < <(pgrep -f 'ros2 launch warotrans' || true)
while read -r pid; do
  [ -n "$pid" ] || continue
  kill -9 "$pid" 2>/dev/null
done < <(pgrep -f 'gz sim' || true)
sleep 1
echo "remaining fleet:"
pgrep -af '/warotrans_fleet/' || echo none
echo "remaining gz:"
pgrep -af 'gz sim' || echo none
exit 0
