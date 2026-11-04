# Junction + off-lane Endpoint access

> Liên quan: `RouteGraphBuilder`, `TrafficGraphCompiler` / `CompiledTrafficGraph`,
> `GET /api/navigation/maps/{id}/route-graph`.

## 1. Vai trò

| Thành phần | Vai trò |
|---|---|
| **Lane (Edge)** | Centre line được cấp quyền; ONE_WAY / BIDIRECTIONAL |
| **JUNCTION** | Polygon chuyển hướng linh hoạt giữa portal lane (không bắt node trung tâm) |
| **Endpoint** | Pose dừng — có thể **ngoài** lane và **ngoài** JUNCTION (Shelf, Parking, Charging, …) |
| **Access spur** | `IsConnector` foot→station, biên dịch vào graph + `bay:{code}` |

Không thêm ZoneType. Không biến cả khu Shelf/Parking thành JUNCTION giả chỉ để pass validation.

## 2. ZoneType (5 loại)

| Zone | Nối topology? | Policy |
|---|---|---|
| `JUNCTION` | portal lane↔lane + EP **trong** polygon | JunctionConflict |
| `SINGLE_OCCUPANCY` | không | capacity 1 trên segment được label |
| `NO_STOP` | không | nhãn `no_stop` |
| `SPEED` | không | `abs_speed_limit` |
| `KEEP_OUT` | cắt lane / chặn spur | xoá / reject |

## 3. Thứ tự gắn Endpoint

1. **On-lane** (≤ `VertexSnapTolerance` ~0.05 m): split lane tại pose; không dịch station.
2. **Strictly inside JUNCTION**: arrivals → station → departures (`IsConnector`+`IsJunction`), chord trong polygon, tránh KEEP_OUT.
3. **Ngoài JUNCTION**: `NearestFoot` trên lane; access foot↔station nếu độ dài ≤ `MaxEndpointAccessDistance` (mặc định 3.0 m):
   - thử spur thẳng (KEEP_OUT + clearance);
   - nếu blocked: **local footprint BFS** trong bbox (compile-time only) → polyline `IsConnector`;
   - strip fail-closed nếu còn thiếu clearance → `SERVICE_ACCESS_BLOCKED` (`KEEP_OUT` / `NO_PATH` / occupancy).
4. Không thoả → `ENDPOINT_TOO_FAR` hoặc SAB (hình học thật sự unreachable). Không Nav2 free-nav runtime.

```
   lane ────────●foot────────
                 │ IsConnector (cả hai chiều bay)
                 ◎ Endpoint (pose giữ nguyên)
```

JUNCTION vẫn dùng cho ngã giao lane; EP dock/shelf **không** bắt buộc nằm trong JUNCTION.

## 4. Occupancy / clearance

- Không hạ ngưỡng footprint / turn để PASS.
- `INSUFFICIENT_CLEARANCE`, `TURN_CLEARANCE`, `CORRIDOR_NO_STOPLINE` là lỗi topology/clearance riêng sau khi attach đúng.
- Không free-space A* quanh kho; chỉ spur thẳng được ủy quyền trên `CompiledTrafficGraph` (ADR 0007).

## 5. Không làm

- Sửa data MapVersion / Endpoint / Edge / Zone trong DB để “vá” validation.
- ZoneType mới / SERVICE_AREA.
- Routing engine song song với Traffic Active.
