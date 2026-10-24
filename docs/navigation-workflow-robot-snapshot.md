# WaroTrans — Navigation types · Workflow · Robot source snapshot

> Snapshot tổng hợp để đọc nhanh. **Không thay** SoT gốc.
>
> | Nguồn | Path |
> |-------|------|
> | Domain / Nav rules | `rules/02-DOMAIN-RULES.md`, `rules/05-NAVIGATION-RULES.md` |
> | Workflow runtime | `rules/03-WORKFLOW-RUNTIME-RULES.md` + `StepTypeRegistry` |
> | MQTT robot↔backend | `docs/mqtt-robot-contracts.md` |
> | Robot status (evidence) | `warotrans/docs/STATUS.md` |
>
> **Ngày gom:** 2026-10-24 · Enums lấy từ code `backend/src/Modules/{Navigation,Fleet,WorkflowExecution}/Enums`.

---

## 1. Navigation resources

### Mental model

```text
Endpoint = WHERE robot phải tới (pose semantic)
Edge     = path segment robot có thể đi (polyline)
Zone     = AREA áp dụng rule traffic/nav
```

Mọi entity thuộc một **MapVersion**. Geometry lưu **world meters** trong `MapVersion.FrameId` (thường `"map"`). **Không persist pixel.**

### MapVersion

| Field quan trọng | Ý nghĩa |
|------------------|---------|
| `Code` | Unique per Warehouse (vd. `MAP-WHREAL-V001`) |
| `MapUri` / `MapYamlUri` / `PreviewImageUri` | Occupancy pgm + yaml + PNG preview |
| `FrameId` | Thường `map` |
| `Resolution`, `OriginX/Y/Yaw` | ROS map metadata |
| `ImageWidthPixels` / `ImageHeightPixels`, thresholds, `ContentHash` | Raster meta |

**`MapStatus`:**

```text
DRAFT → PUBLISHED → ARCHIVED
```

Chỉ `DRAFT` cho phép create/update/delete Endpoint / Edge / Zone. `PUBLISHED` / `ARCHIVED` geometry immutable ở API.

### Endpoint

Semantic destination. Pose: `X`, `Y` (m), `Yaw` (rad), `PositionTolerance`, `YawTolerance`, `IsEnabled`.

**`EndpointType`:**

```text
WAYPOINT
CHARGER
PARK
```

Ví dụ code: `EP-WAYPOINT-01`, `EP-CHARGER-01`, `EP-PARK-01`.

`StorageLocation` (Warehouse) giữ scalar `EndpointId` — không EF-nav sang Navigation.

### EndpointGroup

Nhóm logic các Endpoint (vd. bãi đỗ). MOVE có thể target Endpoint cụ thể hoặc group khi runtime hỗ trợ chọn.

Members: `EndpointGroup` + `EndpointGroupMember`.

### Zone

Polygon GeoJSON trên MapVersion. **Không bắt buộc** gắn Endpoint.

```json
{ "type": "Polygon", "columns": "world meters, ring closed" }
```

**`ZoneType`:**

```text
KEEP_OUT
SPEED
NO_STOP
SINGLE_OCCUPANCY
JUNCTION
```

Cột: `capacity`, `maxSpeed?` (m/s), `isActive`, `policy` (jsonb type-specific), `policySchemaVersion` (v1).

| ZoneType | Policy v1 |
|----------|-----------|
| `KEEP_OUT` | policy rỗng OK; Capacity ≥ 1 |
| `SPEED` | Capacity ≥ 1; `MaxSpeed` bắt buộc |
| `NO_STOP` | policy rỗng OK; Capacity ≥ 1 |
| `SINGLE_OCCUPANCY` | Capacity = 1; MaxSpeed optional |
| `JUNCTION` | Capacity = 1; MaxSpeed optional; di chuyển tự do trong vùng để sang điểm mới |

Không invent ZoneType ngoài enum trên.

### Edge

LineString GeoJSON (polyline có thứ tự). **Không bắt buộc** start/end tại Endpoint. Không force `sourceEndpointId` / `destinationEndpointId`.

**`EdgeDirection`:**

```text
ONE_WAY
BIDIRECTIONAL
```

Properties: `widthMeters` (> 0), `direction`, `capacity`, `maxSpeed?`, `isActive`.

### Traffic (V1)

**Không** persist `TrafficResource` / `TrafficReservation`.  
In-memory `TrafficCoordinator` (single Host): Zone/Edge occupancy, capacity, queue.  
Nav2 = local planning/obstacle; TrafficCoordinator = fleet high-level.  
Chờ traffic ≠ Workflow Step `WAIT`.

### Cấm tạo entity

```text
TransportMovement · BindingSource · TrafficResource · TrafficReservation
```

---

## 2. Workflow

### Design-time vs runtime

```text
Design:  Workflow → WorkflowTask → WorkflowStep
Runtime: TransportRequest (+ Details)
           → Job Planning → 1..N Jobs
           → JobContainer (Request ↔ Job ↔ Container)
           → Job → JobTask → JobStep
```

- `Job` **không** có `TransportRequestId` / `ContainerId` trực tiếp (qua `JobContainer`).
- Plan di chuyển persist duy nhất: `TransportRequestDetail` (1 Request → N Details).

### Core / optional workflows (product)

Core: `INBOUND_PUTAWAY`, `OUTBOUND_RETRIEVAL`, `INTERNAL_RELOCATION`, `POINT_TO_POINT_TRANSPORT`, `PAYLOAD_RECOVERY`, `MAINTENANCE_ALL_ROBOTS`  
Optional: `QUALITY_INSPECTION_TRANSFER`, `ROBOT_RETURN_TO_PARK`, `ROBOT_CHARGING`, `EMPTY_CONTAINER_RETURN`, `ROBOT_PREPOSITIONING`  

Tất cả reuse Step Types dưới đây.

### Step Types (closed — `StepTypeRegistry`)

```text
CHECK
MOVE
HUMAN_INTERACTION
WAIT
```

Admin không invent type/operation/input/output ngoài registry.

#### CHECK — `conditionCode`

```text
ROBOT_READY | BATTERY_MIN | ENDPOINT_AVAILABLE
LOAD_STATE | REQUEST_ACTIVE | INVENTORY_AVAILABLE
```

#### MOVE — `purpose` (`MovePurpose`)

```text
PICKUP | DROPOFF | PARK | CHARGE | TRANSIT
```

Inputs bắt buộc: `robotId`, `targetEndpointId`, `purpose`. Optional: `commandTimeoutSeconds`.  
MOVE **không** tự cập nhật inventory.  
Outputs: `navigationResult` ∈ `SUCCEEDED|FAILED|CANCELED|TIMEOUT`, …

#### HUMAN_INTERACTION — `actionCode`

```text
PICKUP_CONFIRM | DROPOFF_CONFIRM | REPORT_ISSUE
PAYLOAD_TRANSFER_CONFIRM | MAINTENANCE_CONFIRM | INSPECTION_CONFIRM
CHARGE_CONNECT_CONFIRM | CHARGE_DISCONNECT_CONFIRM
```

**`ConfirmationSource`:** `STAFF_APP` | `ROBOT_BUTTON`  
(ROBOT_BUTTON → `confirmedBy` null, `confirmedByRobotId` = robot).

#### WAIT — `waitMode`

```text
DURATION | EVENT | ROBOT_STATE
```

Không dùng WAIT cho Zone/Edge traffic.

### BindingSourceType (code-only, không table)

```text
WORKFLOW_VAR | CURRENT_MOVEMENT | STEP_OUTPUT | CONSTANT
```

Variable source: `ADMIN_INPUT` | `STAFF_INPUT` | `SYSTEM_VALUE`.

### Execution expansion scope (provision)

```text
ONCE_PER_JOB | ONCE_PER_STOP | PER_CONTAINER_AT_STOP
```

Ví dụ: `ROBOT_READY` / `BATTERY_MIN` → ONCE_PER_JOB; MOVE PICKUP|DROPOFF → ONCE_PER_STOP; PICKUP/DROPOFF_CONFIRM → PER_CONTAINER_AT_STOP.

### State machines (rút gọn)

| Entity | States |
|--------|--------|
| TransportRequest | `SUBMITTED → QUEUED → IN_PROGRESS → PARTIALLY_COMPLETED → COMPLETED` (+ `FAILED/CANCELLED/REJECTED`) |
| TransportRequestDetail | `PENDING \| QUEUED \| IN_PROGRESS \| COMPLETED \| FAILED \| CANCELLED` |
| Job | `CREATED → QUEUED → ASSIGNED → RUNNING → … → COMPLETED` (+ `PAUSED/REASSIGNING/RECOVERY_REQUIRED/FAILED/CANCELLED`) |
| JobTask | `PENDING \| READY \| RUNNING \| PAUSED \| COMPLETED \| FAILED \| CANCELLED \| SKIPPED` |
| JobStep | `PENDING \| READY \| EXECUTING \| WAITING \| PAUSED \| COMPLETED \| FAILED \| CANCELLED` |
| JobContainer | `PENDING \| ASSIGNED \| ONBOARD \| DELIVERED \| FAILED \| CANCELLED` |
| Container | `CREATED → PACKED → RESERVED → IN_TRANSIT → STORED` (+ `HOLD/EMPTY/OUT_OF_SERVICE`) |
| Robot (`RobotStatus`) | `OFFLINE \| AVAILABLE \| RESERVED \| EXECUTING \| PAUSED \| CHARGING \| MAINTENANCE \| ERROR` |

`IsOnline` (heartbeat) ≠ `Robot.Status` (operational).

Failure policies: `FAIL_JOB` | `PAUSE_FOR_OPERATOR` | `REQUEST_REASSIGN`.

### Runtime pipeline

```text
TransportRequestDetail
  → Job Planning (JobBatchPlan)
  → IJobRuntimeProvisioner → Jobs + JobContainers
  → expand WorkflowTask → JobTask (theo ExecutionScope)
  → JobStep.ResolvedInputs (JIT) → Step executor → OutputValues
```

MOVE runtime → Fleet MQTT `NAVIGATE_TO_POSE` → robot gateway → Nav2.  
HUMAN_CONFIRM vật lý → MQTT `interaction_*` (không phải RobotCommand).

---

## 3. Robot ↔ Backend (MQTT) — nhắc nhanh

Prefix: `warotrans/v1/robots/{robotCode}/`

| Topic | Chiều | QoS |
|-------|-------|-----|
| `heartbeat` | robot → backend | 0 |
| `telemetry` | robot → backend | 0 |
| `command` / `command_ack` / `command_result` | xuống / lên | 1 |
| `teleop` | backend → robot | 0 |
| `interaction_request` / `confirm` / `result` | xuống / lên / xuống | 1 |

Command types: `NAVIGATE_TO_POSE`, `CANCEL` only.  
Chi tiết payload: `docs/mqtt-robot-contracts.md`.

Config backend: `WaroTrans.Host/appsettings.json` → `Mqtt`.  
Robot env: `WARO_MQTT_HOST`, `WARO_MQTT_PORT`, `WARO_ROBOT_CODE`, …

---

## 4. Trạng thái source code robot (`warotrans`)

Nguồn evidence: `warotrans/docs/STATUS.md` (last reviewed ~2026-10-20; các mốc E2E Job tới 2026-10-21).

### Stack phần cứng / OS (VERIFIED)

| Thành phần | Trạng thái |
|------------|------------|
| Raspberry Pi 5 + Ubuntu Server 24.04, user `waro`, `warotrans.local` | OK |
| ESP32-S3 + Cytron MDD10A + 4× JGB37-520 skid-steer | Motor bring-up OK |
| Chassis 320×260 mm, wheel Ø65 mm | OK |
| RPLIDAR A1 → `/scan` ~7 Hz | OK |
| Wheel odom `/odom` ~50 Hz; TF `odom→base_footprint→base_link→laser` | OK |
| Calibration: `ticks_per_rev` 2478.1; wheel_radius L/R; separation **0.4535 m** | Recorded in `docs/calibration.md` |

### ROS packages (`ros2_ws/src`)

| Package | Vai trò |
|---------|---------|
| `warotrans_msgs` | Custom msgs (nếu cần) |
| `warotrans_description` | URDF / static TF |
| `warotrans_hardware` | ESP32 bridge, encoder, wheel odom |
| `warotrans_sensors` | LiDAR (+ IMU later) |
| `warotrans_localization` | AMCL / EKF config |
| `warotrans_slam` | SLAM Toolbox |
| `warotrans_navigation` | Nav2 params, BT, maps |
| `warotrans_perception` | Camera/vision (chưa verify) |
| `warotrans_fleet` | **MQTT gateway** `robot_gateway_node` |
| `warotrans_teleop` | Teleop |
| `warotrans_simulation` | Gazebo Harmonic sim |
| `warotrans_bringup` | Compose launch only |

### Phase / capability matrix (rút từ STATUS)

| Capability | Evidence | Status |
|------------|----------|--------|
| Phase 0 Nav2 RViz real robot (`NavigateToPose` → `/cmd_vel` → ESP32) | 2026-09-11 | **PASS** (interface frozen) |
| Semantic map editor / Nav integration (demo phases) | STATUS Phase 2–3 | Editor PASS; outdoor motion DoD còn mở |
| Fleet heartbeat/telemetry E2E thật (`RBT-001` ↔ Mosquitto ↔ Host) | 2026-10-18 | **PASS** (`isOnline` timeout ~5 s) |
| MOVE MQTT → Nav2 trong Job physical E2E | 2026-10-21 `JOB-20261021-000001` | **PASS** (SRC+DST SUCCEEDED) |
| HUMAN_CONFIRM nút BCM12 trong Job (`interaction_*`) | 2026-10-21 | **PASS** (`ROBOT_BUTTON`) |
| Battery % trên telemetry | BMS bảo vệ-only | `null` — cảm biến pin **CHƯA XÁC NHẬN** |
| CANCEL mid-path / timeout DoD CLI riêng | — | Chưa claim |
| EKF + IMU fusion NavigateToPose | smoke đứng yên 2026-10-16 | Mapping+EKF / SUCCEEDED còn thiếu |
| Closed-loop motor PID | — | Chưa |
| Camera CSI / pose | — | **CHƯA XÁC NHẬN** |
| Multi-robot | — | Chưa |

### TF contract (bất biến)

```text
map → odom → base_footprint → base_link → laser
                         └── camera_link   # chỉ khi pose đã xác nhận
```

Một TF edge = một publisher. Nav mode mặc định: `map→odom` AMCL; `odom→base_footprint` wheel odom (EKF optional qua `enable_ekf`).

### Gateway MQTT (robot)

- Node: `warotrans_fleet/robot_gateway_node.py`
- Config: `config/robot_gateway.yaml` (sim: `warotrans_simulation/.../robot_gateway_sim.yaml`)
- Uplink: heartbeat ~1 Hz, telemetry ~5 Hz
- Downlink: `command`, `teleop`, `interaction_request` / `interaction_result`
- Human button: `InteractionController` + `LgpioButtonInput` (default `human_confirm_enabled:=false`)

### Còn mở / rủi ro ngắn

- Outdoor Nav2 mid-path stall — sync params xong, chưa claim motion PASS.
- ESP32 `/dev/warotrans` endurance; encoder sign-only test riêng.
- Camera CSI cable Pi 5 + driver Ubuntu (R-CAM-1/2 trong STATUS).
- Product features multi-robot / full warehouse rollout — chưa mở.

---

## 5. Conflict note (rules vs runtime)

`rules/03-WORKFLOW-RUNTIME-RULES.md` từng ghi *“Execution/orchestration is not”*.  
Evidence hiện tại (Job physical E2E 2026-10-21 + `JobExecutionEngine` trong Host) cho thấy **runtime MOVE + HUMAN_CONFIRM đã chạy trên robot thật**. Khi đọc rule cũ: ưu tiên evidence/`STATUS` + code; nếu sửa domain behavior phải cập nhật rules trước, không đoán silent.

---

## 6. Đọc thêm

| Chủ đề | File |
|--------|------|
| Nav rules đầy đủ | `rules/05-NAVIGATION-RULES.md` |
| Workflow variables / bindings | `rules/03-WORKFLOW-RUNTIME-RULES.md` |
| MQTT payloads | `docs/mqtt-robot-contracts.md` |
| Robot evidence sống | `../warotrans/docs/STATUS.md` |
| Robot interfaces / TF | `../warotrans/docs/interfaces.md` |
| Calibration numbers | `../warotrans/docs/calibration.md` |
| Physical Job audit | `docs/audits/physical-human-interaction-button-e2e.md` |
| Sim backend nhận robot ảo | `docs/simulation/02-backend-nhan-robot-ao.md` |
