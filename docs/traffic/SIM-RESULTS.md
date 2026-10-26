# Simulation results — Traffic Active

**Date:** 2026-10-25  
**Environment:** WSL Gazebo `sim_bringup.launch.py` + `route_graph`

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | FollowPath on approved segment | **NOT_RUN** | Agent host has no Gazebo/WSL ROS session in this run |
| 2 | Denied junction entry (stop at safe stop) | **NOT_RUN** | |
| 3 | Unreachable path | **NOT_RUN** | |
| 4 | Local obstacle → collision_monitor stop | **NOT_RUN** | |
| 5 | Corridor deviation (pose offset inject) | **NOT_RUN** | |
| 6 | Lost backend (MQTT down) | **NOT_RUN** | |

## Install if `nav2_route` missing

```bash
sudo apt update
sudo apt install ros-jazzy-nav2-route
```

## How to run (operator)

```bash
# WSL, after sourcing ROS + workspace
ros2 launch warotrans_simulation sim_bringup.launch.py route_graph:=/path/to/route_graph.geojson
# then exercise MQTT NAVIGATE+authority against the sim gateway with traffic_mode:=active
```

Unit tests covering client/supervisor/gate: **PASS** (see robot pytest).
