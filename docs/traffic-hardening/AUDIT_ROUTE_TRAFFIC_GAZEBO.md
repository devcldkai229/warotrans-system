# Audit trạng thái hiện tại — Route graph → Traffic → Reservation → Lane follow (Gazebo)

**Ngày:** 2026-10-29  
**Status tổng:** `PARTIALLY VERIFIED` (xem [`CHATGPT_TRAFFIC_CURRENT_STATE.md`](CHATGPT_TRAFFIC_CURRENT_STATE.md))  
**Map runtime sim:** `MAP-WHSIM-V019` (`d676f366-6f08-417d-921f-ac89e0b18626`)  
**Mode:** `Traffic__Mode=Active`  
**Repos:** `warotrans-system` + `warotrans` nhánh `feature/traffic-hardening`

Tài liệu này mô tả **cách hệ thống tính và chạy** từ hình học map đến robot Gazebo bám lane — không phải changelog chi tiết từng commit.

---

## 0. Bức tranh tổng

```text
┌─ Map Editor / DB ─────────────────────────────────────────────────────────┐
│  MapVersion + occupancy (PGM/YAML)                                        │
│  Endpoint · Edge · Zone  (GeoJSON mét thế giới, FrameId=map)              │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ compile
┌─ Host (Navigation) ───────────▼───────────────────────────────────────────┐
│  RouteGraphBuilder → topology nodes/edges ổn định                         │
│  TrafficGraphCompiler → CompiledTrafficGraph + graphHash                  │
│    resources · corridors · stoplines · swept conflicts · safe-stops       │
└───────┬─────────────────────────────────────────┬─────────────────────────┘
        │ GET .../route-graph (GeoJSON)           │ in-memory SegmentedTrafficCoordinator
        ▼                                         ▼
┌─ Robot (ROS 2) ──────────────┐    ┌─ Active MOVE / authority ────────────┐
│  nav2_route Route Server     │    │  RequestSegment → AcquireAtomic      │
│  compute_route + FollowPath  │◄───│  MQTT NAVIGATE + EXTEND_AUTHORITY    │
│  (RPP bám centre line)       │    │  SAFE_STOP_REACHED → nhả occupancy   │
└──────────────┬───────────────┘    └──────────────────────────────────────┘
               │ /cmd_vel_nav → smoother → collision_monitor → authority_gate → /cmd_vel
               ▼
┌─ Gazebo ──────────────────────────────────────────────────────────────────┐
│  DiffDrive + LiDAR + /odom + TF odom→base_footprint                       │
│  AMCL: map→odom · gateway đọc map→base_link → telemetry MQTT              │
└───────────────────────────────────────────────────────────────────────────┘
```

**Quyền sở hữu đường đi (ADR 0007):**  
`CompiledTrafficGraph` trên Host là source of truth → export GeoJSON cho Nav2 Route Server → robot chỉ `ComputeRoute` / `FollowPath` trên graph đó. **Không** chạy free GridBased planner song song khi `route_graph:=` bật.

**Cấm domain:** không tạo entity/table `TrafficResource` / `TrafficReservation` / `TransportMovement` — occupancy & reservation chỉ **in-memory** trong `TrafficState`.

---

## 1. Lớp map (Input)

| Khái niệm | Ý nghĩa | Lưu ở đâu |
|-----------|---------|-----------|
| **MapVersion** | Bản đồ phiên bản (DRAFT → PUBLISHED) + occupancy | `navigation.map_versions` |
| **Endpoint** | Điểm đến nghiệp vụ (INBOUND, PARK, kệ…) + pose (x,y,yaw) | `navigation.endpoints` |
| **Edge** | Lane vẽ tay (LineString mét) + direction ONE_WAY / BIDIRECTIONAL | `navigation.edges` |
| **Zone** | Polygon luật (JUNCTION, NO_STOP, KEEP_OUT, …) | `navigation.zones` |

Geometry luôn **mét thế giới** trong `FrameId` (thường `map`). Pixel không persist.

**Sim hiện tại:** MAP-WHSIM-V019 đã export snapshot tại `samples/maps/MAP-WHSIM-V019/`.  
Validation Errors = **0** (`isValid=true`); còn warning LEGACY_JUNCTION_ZONE / AMBIGUOUS_INTERSECTION.

---

## 2. Cách dựng Route Graph / Traffic Graph (Host)

### 2.1 Pipeline compile

```text
Edges + Endpoints + Zones (+ optional OccupancyGrid)
        │
        ▼
 RouteGraphBuilder          ← snap đỉnh, tách T-junction, cắt KEEP_OUT,
        │                     nối JUNCTION, gắn endpoint, kiểm reachability
        ▼
 TrafficGraphCompiler       ← footprint robot (dài×rộng + padding)
        │
        ├── TrafficNode / TrafficEdge (id ổn định)
        ├── Resources: lane · zone · junction · bay · narrow · overlap · node
        ├── Critical corridors + Stoplines (cửa vào)
        ├── Safe-stops / holding (không nằm trong critical)
        ├── SweptConflictIndex (capsule xung đột hình học, đối xứng)
        ├── ExitSafeStops (BFS ra khỏi resource tới safe-stop)
        └── graphHash = SHA-256(canonical input JSON)   ← fingerprint
```

### 2.2 Hai hash cần nhớ

| Ngữ cảnh | `includeOccupancy` | Hash điển hình V019 | Ai dùng |
|----------|--------------------|---------------------|---------|
| Runtime Active / route-graph export | **false** (`RuntimeIncludesOccupancy`) | `e6009540…` | Robot, coordinator, MQTT pathHash |
| Validation / debug SVG | **true** | `6a9bf530…` | Editor / QA |

Cùng MapVersion nhưng **khác hash** nếu occupancy vào fingerprint. Active **không** được bind nhầm graph validation (đã fix `TryGetForMap` → tránh `GRAPH_IN_USE`).

### 2.3 API liên quan

| API | Việc |
|-----|------|
| `GET /api/navigation/maps/{id}/route-graph` | GeoJSON cho Nav2 (`properties.graphHash`) |
| `GET .../traffic-graph/validation` | Compile + báo Errors/Warnings |
| `GET .../traffic-graph/debug.svg` | Overlay trực quan |
| `GET /api/fleet/traffic/snapshot` | Occupancy / holds / authority live |

Fetch sim: `warotrans_simulation/scripts/fetch_route_graph.sh` → `/home/ser/maps/route_graph_v019.geojson`.

---

## 3. Traffic resources & “reservation” (in-memory)

Không có bảng reservation. Mọi khóa nằm trong `SegmentedTrafficCoordinator` / `TrafficState`:

| Loại resource (ví dụ) | Ý nghĩa | Capacity |
|----------------------|---------|----------|
| `lane:EDGE-…` | Làn theo mã edge | theo lane meta |
| `junction:ZONE-…` | Nhóm cạnh trong JUNCTION / NO_STOP | thường 1 |
| `narrow:EDGE-…` | Hai chiều cùng tâm → mutex đối đầu | 1 |
| `overlap:a:b` | Hai cạnh swept chồng (khoảng ≤ 2×turnRadius) | 1 |
| `bay:EP-…` | Service hold tại station | 1 |
| `node:N` | Giao cắt / safe-stop / station | 1 |
| `corridor:…` | Hành lang critical còn lại | 1 |

### 3.1 Vòng đời reservation / authority (Active)

```text
Job MOVE start
  │
  ├─ BindGraph(mapVersionId, runtime graph)     ← từ chối nếu đổi hash khi robot đang giữ
  ├─ EnsureTracked(pose)                        ← quarantine nếu không LOCALIZED
  ├─ N4: ReleaseStaleServiceHolds(keep=bay đích) ← chỉ khi đã clear vật lý
  ├─ Acquire bay đích (StationPolicy)           ← trước khi route
  │
  ├─ RequestSegment(start→goal)                 ← Dijkstra trên CompiledTrafficGraph
  │     chia thành segment tới safe-stop / stopline
  │
  └─ AcquireAtomic(segment[0])
        │ Granted → Authority { seq, epoch, edgeIds, pathHash, expires }
        │ Queued  → waiter (STATION_BUSY / resource busy)
        │ Reject  → QUARANTINED / conflict / …
              │
              ▼
     TrafficAuthorityPublisher
        MQTT NAVIGATE_TO_POSE + authority payload
        (sau này EXTEND_AUTHORITY / RENEW / REVOKE)
```

**pathHash** = `SHA256(graphHash|edgeId,edgeId,…)` — robot phải khớp `compute_path_hash` trước khi chạy.

### 3.2 Khi robot báo tiến độ

| Sự kiện robot → Host | Host làm gì |
|----------------------|-------------|
| `SAFE_STOP_REACHED` | Nhả occupancy **lane/junction/overlap** đã qua; **không** nhả `ServiceHoldIds` (T11) |
| `EXTEND` / tiếp segment | `AcquireAtomic` segment kế; publish `EXTEND_AUTHORITY` |
| Navigate FAIL / cancel | Quarantine hoặc giữ hold đến khi clear / operator |
| Job complete / MOVE kế | N4: nhả bay cũ nếu footprint đã ra khỏi polygon bay |

**N4 (station hold):** giữ bay cho tới khi (1) bước trước xong, (2) `IsPhysicallyClear`, (3) bay không thuộc set đích mới, (4) không quarantine vì occupancy đó. Không nhả chỉ vì MOVE bắt đầu.

---

## 4. Robot: nhận grant → bám lane (ROS 2)

### 4.1 Gateway Active (`robot_gateway` + `TrafficClient`)

```text
MQTT command NAVIGATE_TO_POSE
  │  kiểm mapVersionCode, graphHash, pathHash, seq/epoch
  ▼
TrafficClient EXECUTING
  │  chỉ edge trong authority.segment_edge_ids
  ▼
Nav2SegmentExecutor
  │  compute_route trên Route Server (GeoJSON đã load)
  │  FollowPath (RPP) — pose dọc tâm lane
  ▼
cmd_vel pipeline (sim Active):
  controller → /cmd_vel_nav
            → velocity_smoother → /cmd_vel_smoothed
            → collision_monitor → /cmd_vel_safe
            → authority_gate    → /cmd_vel     (cắt Twist nếu mất authority)
```

Robot **không** tự mở rộng ngoài segment; chỉ tiếp tục sau safe-stop + EXTEND hợp lệ. FAULTED chỉ thoát bằng authority seq cao hơn sau sync `authority_state`.

### 4.2 Tham số sim Phase B (đo rồi chỉnh)

Merge order Nav2: `nav2_params → outdoor → route → **nav2_params_sim (cuối)**`.

| Tham số | Giá trị hiện tại | Lý do |
|---------|------------------|-------|
| `desired_linear_vel` | 0.24 m/s | Giữ `v/L ≤ ~1.2` với L=0.20 |
| `lookahead_dist` | 0.20 m | Làn hẹp; L=0.30 cắt góc → collision-ahead |
| `xy_goal_tolerance` | **0.10 m** | 0.05 m không khả thi (~9 cm residual tại INBOUND) |
| `yaw_goal_tolerance` | 0.25 rad | Station yaw |

Baseline tracking (JOB-000003): RMS ~5.1 cm, peak ~14.6 cm.

---

## 5. Gazebo — lớp vật lý / cảm biến

```text
gz sim (warehouse.sdf)
  │ DiffDrive: /cmd_vel → bánh → /odom + TF odom→base_footprint
  │ LiDAR → /scan
  │ ros_gz_bridge: /clock, /cmd_vel, /odom, /tf, /scan, …
  ▼
AMCL + map_server     → TF map→odom
robot_state_publisher → base_footprint→base_link→laser
gateway               → TF map→base_link → MQTT telemetry (pose, LOCALIZED)
```

**Hợp đồng TF (bất biến):**

```text
map → odom → base_footprint → base_link → laser
```

Một cạnh TF chỉ một publisher. Sim dùng `use_sim_time=true` từ `/clock` Gazebo.

**Cạm bẫy ops đã gặp:** nhiều process `parameter_bridge` sót → nhiều `/clock` → TF “jump back in time” → Nav2 abort. Luôn `_kill_all_sim.sh` trước khi launch lại. Host nên start **sau** khi robot `LOCALIZED` (tránh `QUARANTINED:RECONCILE_LOCALIZATION`).

Launch Active sim:

```bash
GUI=false bash ros2_ws/scripts/launch_sim_active.sh
# route_graph=/home/ser/maps/route_graph_v019.geojson
# gateway: robot_gateway_sim_active_overlay.yaml (RBT-SIM-01, authority gate ON)
```

---

## 6. Chuỗi một MOVE nghiệp vụ (Inbound ví dụ)

```text
1. Staff queue TR → Job INBOUND_PUTAWAY
2. Start Job trên RBT-SIM-01
3. CHECK dock available
4. MOVE_TO_DOCK (EP-INBOUND)
     Host: bay:EP-INBOUND hold → segment grants → MQTT NAVIGATE+authority
     Robot: Route Server path dọc lane → RPP → Gazebo chạy
     Tới safe-stop / goal → SAFE_STOP_REACHED / COMPLETED
5. HUMAN PICKUP_CONFIRM × N
6. MOVE_TO_RACK S01…  (N4 nhả bay INBOUND khi clear + giữ bay kệ)
7. DROPOFF_CONFIRM …
8. Job COMPLETED → nhả hold còn lại khi clear / parking
```

Evidence gần nhất closeout: **JOB-20261028-000009** hoàn thành tới S01 putaway rồi **FAIL** tại MOVE S02 (`CONTROLLER_FAILED` / collision-ahead) — chưa đủ 3× E2E 17/17.

---

## 7. Trạng thái kiểm chứng (tóm tắt)

| Tầng | Trạng thái |
|------|------------|
| Compile / validation V019 | **PASS** — 0 Error |
| Unit traffic/graph (N4, symmetrize, stopline/exit) | **PASS** |
| Active reservation + authority MQTT | **Có** — chạy được trên sim |
| Lane follow Gazebo (inbound dock) | **Có** — tới IN + S01 trong JOB-000009 |
| 3× E2E inbound 17/17 độc lập | **CHƯA** |
| Two-robot Gazebo + dual Nav2 | **NOT_RUN** |

---

## 8. File / lệnh đối chiếu nhanh

| Việc | Đường dẫn |
|------|-----------|
| Compiler | `backend/.../Navigation/Traffic/TrafficGraphCompiler.cs` |
| Swept conflict | `backend/.../Navigation/Traffic/SweptConflictIndex.cs` |
| Coordinator / holds | `backend/.../Fleet/Traffic/TrafficState.cs` |
| MOVE Active | `backend/.../WorkflowExecution/Execution/JobExecutionEngine.cs` |
| Authority MQTT | `backend/.../Fleet/Traffic/TrafficAuthorityPublisher.cs` |
| Robot TrafficClient | `ros2_ws/src/warotrans_fleet/warotrans_fleet/traffic_client.py` |
| Nav merge / sim params | `warotrans_navigation/launch/navigation.launch.py`, `nav2_params_sim.yaml` |
| Sim Active launch | `ros2_ws/scripts/launch_sim_active.sh` |
| Closeout status | [`CHATGPT_TRAFFIC_CURRENT_STATE.md`](CHATGPT_TRAFFIC_CURRENT_STATE.md) |
| ADR ownership | `docs/adr/0007-traffic-route-ownership.md` |

---

## 9. Kết luận audit

Hệ thống hiện tính đường đi và xung đột **trên Host** (compiled graph + in-memory resources), **cấp quyền từng segment** qua MQTT authority, và bắt robot Gazebo **chỉ FollowPath trên lane graph** đã export. Validation map V019 sạch Error; Active 1 robot đã chứng minh được đoạn INBOUND→S01. Còn thiếu lặp E2E đầy đủ và hạ tầng 2 robot trước khi gọi là `SIMULATION ACCEPTED`.
