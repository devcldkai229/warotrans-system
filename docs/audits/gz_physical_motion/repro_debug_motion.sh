#!/usr/bin/env bash
# Relaunch sim (instrumented gate/semantic) + run pipeline probe.
set +e
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
AUD=/mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion
bash "$AUD/start_gui_sim01.sh"
bash "$AUD/wait_bringup.sh" || exit 1
# Extra settle: HB→MarkOnline + semantic MQTT bind after gateway start.
sleep 20
echo "=== running debug_pipeline_repro (ParkingA→ParkingB) ==="
python3 "$AUD/debug_pipeline_repro.py" | tee "$AUD/debug_pipeline_repro_console.txt"
echo "=== done; logs in warotrans-system/debug-100d90.log ==="
