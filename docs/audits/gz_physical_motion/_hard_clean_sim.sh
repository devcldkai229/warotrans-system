#!/usr/bin/env bash
set +e
for pat in \
  controller_server planner_server bt_navigator behavior_server \
  velocity_smoother collision_monitor map_server amcl \
  lifecycle_manager path_policy cmd_vel_authority parameter_bridge \
  robot_state_publisher robot_gateway 'gz sim' 'ros2 launch warotrans' \
  multi_sim_map_one '/warotrans_fleet/'
do
  while read -r pid; do
    [ -n "$pid" ] || continue
    # never kill self
    [ "$pid" = "$$" ] && continue
    kill -9 "$pid" 2>/dev/null
  done < <(pgrep -f "$pat" || true)
done
sleep 2
echo "remaining:"
pgrep -af 'controller_server|planner_server|robot_gateway|gz sim|multi_sim' || echo none
exit 0
