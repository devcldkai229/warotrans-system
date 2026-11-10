# Source setup (WSL, once):
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}

# Cancel active goal before each new one (sim01 namespace):
ros2 service call /sim01/navigate_to_pose/_action/cancel_goal action_msgs/srv/CancelGoal "{}"

# --- Parking A → EP-INBOUND (Inbound) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 1.747, y: 1.543, z: 0.0}, orientation: {z: -0.707107, w: 0.707107}}}}"

# --- Parking A → EP-INSPECTION (Inspection) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.652, y: -0.936, z: 0.0}, orientation: {z: 0.707107, w: 0.707107}}}}"

# --- Parking A → EP-OUTBOUND (Outbound) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 1.793, y: -0.977, z: 0.0}, orientation: {z: 0.707107, w: 0.707107}}}}"

# --- Parking A → EP-PARKING-B (Parking B) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: -1.15, y: -0.525, z: 0.0}, orientation: {z: -0.707107, w: 0.707107}}}}"

# --- Parking A → EP-SHELF-A-01 (Shelf A 01) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: -1.325, y: 1.644, z: 0.0}, orientation: {z: 1.000000, w: 0.000000}}}}"

# --- Parking A → EP-SHELF-A-02 (Shelf A 02) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: -1.332, y: 1.356, z: 0.0}, orientation: {z: 1.000000, w: 0.000000}}}}"

# --- Parking A → EP-SHELF-A-03 (Shelf A 03) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: -1.337, y: 0.973, z: 0.0}, orientation: {z: 1.000000, w: 0.000000}}}}"

# --- Parking A → EP-SHELF-A-04 (Shelf A 04) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: -1.335, y: 0.676, z: 0.0}, orientation: {z: 1.000000, w: 0.000000}}}}"

# --- Parking A → EP-SHELF-B-01 (Shelf B 01) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.598, y: 1.025, z: 0.0}, orientation: {z: 0.707107, w: 0.707107}}}}"

# --- Parking A → EP-SHELF-B-02 (Shelf B 02) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.871, y: 1.025, z: 0.0}, orientation: {z: 0.707107, w: 0.707107}}}}"

# --- Parking A → EP-SHELF-B-03 (Shelf B 03) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.8, y: 1.411, z: 0.0}, orientation: {z: 1.000000, w: 0.000000}}}}"

# --- Parking A → EP-SHELF-B-04 (Shelf B 04) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.793, y: 1.671, z: 0.0}, orientation: {z: 1.000000, w: 0.000000}}}}"

# --- Parking A → EP-SHELF-C-01 (Shelf C 01) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.875, y: -0.777, z: 0.0}, orientation: {z: 0.707107, w: 0.707107}}}}"

# --- Parking A → EP-SHELF-C-02 (Shelf C 02) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 0.865, y: -1.09, z: 0.0}, orientation: {z: 0.707107, w: 0.707107}}}}"

# --- Parking A → EP-WAIT-POINT (Wait Point) ---
timeout 180 ros2 action send_goal /sim01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 1.292, y: 0.83, z: 0.0}, orientation: {z: 0.000000, w: 1.000000}}}}"

