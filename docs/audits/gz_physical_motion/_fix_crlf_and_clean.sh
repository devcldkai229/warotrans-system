#!/usr/bin/env bash
set +e
DIR=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion
for f in _hard_clean_sim.sh _start_leave_sim.sh _run_leave_cm_off.sh wait_bringup.sh _parse_leave_log.py verify_parking_leave_inbound.py; do
  sed -i 's/\r$//' "$DIR/$f" 2>/dev/null
done
bash "$DIR/_hard_clean_sim.sh"
sleep 1
pgrep -af controller_server || echo no_controller
pgrep -af 'gz sim' || echo no_gz
