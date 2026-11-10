#!/usr/bin/env bash
# Flip the Collision Monitor A/B switch for real.
#
# CM_MODE used to be a bare log label: the actual switch is
# collision_monitor.FootprintApproach.enabled in nav2_params_sim.yaml, which the handoff
# expected an operator to edit by hand. A run labelled direct-on against a CM-off build
# therefore produced evidence that quietly said the opposite.
#
# install/.../config/nav2_params_sim.yaml is a symlink to the source file (colcon
# --symlink-install), so editing the source is enough -- no colcon build. Nav2 reads
# params at node start, so the stack still has to be RELAUNCHED.
#
# Usage: bash _set_cm_mode.sh on|off
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  on)  WANT=true ;;
  off) WANT=false ;;
  *)   echo "usage: $0 on|off" >&2; exit 2 ;;
esac

YAML=/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/config/nav2_params_sim.yaml
INSTALLED=/mnt/e/programming/my_project/warotrans/ros2_ws/install/warotrans_simulation/share/warotrans_simulation/config/nav2_params_sim.yaml

[ -f "$YAML" ] || { echo "missing $YAML" >&2; exit 1; }

# Only the FootprintApproach block carries `enabled:` under a 6-space indent followed by
# `visualize:`; target it by its position inside that block rather than by line number.
python3 - "$YAML" "$WANT" <<'PY'
import re, sys
path, want = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()
pat = re.compile(r"(FootprintApproach:(?:\n(?:[ \t].*)?)*?\n      enabled: )(true|false)")
m = pat.search(src)
if not m:
    sys.exit("could not locate FootprintApproach.enabled")
if m.group(2) == want:
    print(f"FootprintApproach.enabled already {want}")
else:
    open(path, "w", encoding="utf-8").write(src[: m.start(2)] + want + src[m.end(2) :])
    print(f"FootprintApproach.enabled {m.group(2)} -> {want}")
PY

if [ ! -L "$INSTALLED" ]; then
  echo "WARNING: installed yaml is a copy, not a symlink - run colcon build --packages-select warotrans_simulation --symlink-install" >&2
fi

echo "--- effective now ---"
grep -n -A6 "FootprintApproach:" "$YAML" | grep -E "enabled|time_before_collision"
echo "RELAUNCH the stack for this to take effect (_hard_clean_sim.sh; _start_leave_sim.sh; wait_bringup.sh)."
