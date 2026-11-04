# 05 — Robot Edge Package Model

**Audit date:** 2026-11-03  
**Repo:** `warotrans`  
**Workspace:** `ros2_ws/src` — **13** ROS packages (VERIFIED)

---

## ROS package catalog

| Package | Path | Build type | Intent |
|---|---|---|---|
| `warotrans_msgs` | `ros2_ws/src/warotrans_msgs` | ament_cmake | Shared messages |
| `warotrans_description` | `ros2_ws/src/warotrans_description` | ament_cmake | URDF / robot description |
| `warotrans_hardware` | `ros2_ws/src/warotrans_hardware` | ament_python | ESP32 bridge, wheel odom |
| `warotrans_sensors` | `ros2_ws/src/warotrans_sensors` | ament_python | Ultrasonic, BNO055 helpers (+ lidar bringup via deps/launch) |
| `warotrans_localization` | `ros2_ws/src/warotrans_localization` | ament_cmake | AMCL/EKF/map_server launch+config |
| `warotrans_slam` | `ros2_ws/src/warotrans_slam` | ament_cmake | slam_toolbox launch+config |
| `warotrans_navigation` | `ros2_ws/src/warotrans_navigation` | ament_cmake | Nav2 params/launch/BT; optional authority gate co-start |
| `warotrans_lane_planner` | `ros2_ws/src/warotrans_lane_planner` | ament_cmake | LaneAwareNavfn Nav2 plugin |
| `warotrans_fleet` | `ros2_ws/src/warotrans_fleet` | ament_python | MQTT gateway, authority gate, path policy validator |
| `warotrans_teleop` | `ros2_ws/src/warotrans_teleop` | ament_python | Web teleop commissioning |
| `warotrans_perception` | `ros2_ws/src/warotrans_perception` | ament_python | Scaffold (no executables) |
| `warotrans_bringup` | `ros2_ws/src/warotrans_bringup` | ament_cmake | Robot stack orchestration launches |
| `warotrans_simulation` | `ros2_ws/src/warotrans_simulation` | ament_cmake | Gazebo Harmonic sim + semantic adapter scripts |

---

## Key executables / plugins (VERIFIED)

| Package | Component | Kind |
|---|---|---|
| `warotrans_fleet` | `robot_gateway_node` | MQTT gateway node |
| `warotrans_fleet` | `cmd_vel_authority_gate` | Motion authority gate |
| `warotrans_fleet` | `path_policy_validator` | Path policy validation node |
| `warotrans_hardware` | `esp32_bridge_node`, `wheel_odom_node` | Hardware bridge |
| `warotrans_sensors` | `ultrasonic_node`, `bno055_node` | Sensor nodes |
| `warotrans_teleop` | `web_teleop_node` | Teleop |
| `warotrans_lane_planner` | `LaneAwareNavfn` | pluginlib → `nav2_core::GlobalPlanner` |
| `warotrans_simulation` | `semantic_map_adapter.py` (+ other sim scripts) | Installed programs |

---

## package.xml dependencies (warotrans_* only) — VERIFIED for UML

```text
warotrans_hardware      → warotrans_msgs
warotrans_teleop        → warotrans_msgs, warotrans_hardware
warotrans_navigation    → warotrans_lane_planner          (exec_depend)
warotrans_bringup       → description, hardware, teleop, sensors,
                          localization, slam, navigation, perception, fleet
warotrans_simulation    → description, localization, navigation,
                          fleet, lane_planner
```

Arrow = dependent package → required package.

---

## Non-package.xml couplings (annotate; do not silently treat as package.xml deps)

| From | To | Kind | Evidence |
|---|---|---|---|
| `warotrans_navigation` launch | `warotrans_fleet` (`cmd_vel_authority_gate`) | «launch» | `navigation.launch.py` when `enable_authority_gate` |
| `warotrans_fleet` path_policy_validator | `warotrans_simulation` semantic_map_adapter | «python import» | `_load_adapter()` via package prefix / sibling path — **not** in fleet package.xml |
| Nav2 YAML | `warotrans_lane_planner` | «pluginlib» | `nav2_params_lane_aware.yaml` |
| Gateway ↔ Gate | topics `cmd_vel_safe`, `traffic/authority_ok` | «runtime topic» | fleet node sources |

---

## Planner defaults

| Config | Planner plugin |
|---|---|
| Default `warotrans_navigation/config/nav2_params.yaml` | `nav2_navfn_planner::NavfnPlanner` |
| Overlay `nav2_params_lane_aware.yaml` | `warotrans_lane_planner::LaneAwareNavfn` |

---

## Firmware (outside ROS package graph)

| Path | Notes |
|---|---|
| `firmware/warotrans_low_level/` | ESP32 Arduino sketch |
| `firmware/encoder_test/` | Test sketch |

Do **not** list as ROS packages. Optional note on Robot Edge diagram as external MCU software communicating with `warotrans_hardware` over serial (runtime).

---

## UML diagram guidance

1. Outer logical package `RobotEdge`.
2. Nest all 13 ROS packages; visually group or stereotype `warotrans_simulation` as simulation-only.
3. Solid dashed UML deps = package.xml (and verified Python imports that are also declared).
4. Show launch/plugin/topic couplings only with explicit stereotypes or on a separate interaction diagram.
5. Do not invent packages for Nav2, Gazebo, RPLIDAR — external.
