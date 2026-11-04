# MAP-ONE SIM-01 — Handoff: Direct Nav2 FAIL (Parking A → INBOUND)

**Ngày:** 2026-11-02  
**Mục đích:** Claude tự audit Gazebo, sửa root cause, **không** dùng chuỗi waypoint ép.  
**Repos:** `warotrans` (ROS/Gazebo) + `warotrans-system` (Host + audit scripts).

---

## 1. Final flow mong muốn

```text
SIM-01 spawn EP-PARKING-A
  → một NavigateToPose duy nhất tới EP-INBOUND (1.747, 1.543, -π/2)
  → LaneAwareNavfn + Map Editor lanes only (7 EDGE, không EDGE-LEAVE giả)
  → costmap + KEEP_OUT + ONE_WAY + Motion Authority Gate bật
  → RPP use_collision_detection: true
  → CM OFF trước, rồi CM ON (A/B)
  → status_4, err_xy ≤ 0.20 m, err_yaw ≤ 0.40 rad (nav2_params_sim)
  → không wall-hug south mouth, không phá ONE_WAY, không tắt RPP/CM để “pass”
```

**Không phải final flow:** PRE → VIA → NORTH → MID → INBOUND (script ép hop). Đó chỉ là harness cũ — **PASS nhưng không autonomous**.

---

## 2. Trạng thái hiện tại (tóm tắt)

| Test | Kết quả | Ghi chú |
|------|---------|---------|
| Guided multi-hop + EDGE-LEAVE tạm | PASS (cũ) | **Không** chấp nhận làm solution |
| Direct CM OFF, Map Editor lanes | **FAIL** | Gần INBOUND XY, yaw fail / TIMEOUT |
| Direct CM ON | **FAIL** | Kẹt south mouth, CM chặn cmd_vel |
| Reservation / authority | Grant lúc đi, **mất khi stall** gần goal | Verify bắn Nav2 thẳng (không MQTT job đầy đủ) |

`lanes.json` đã **restore** từ Map Editor snapshot (`samples/maps/MAP-ONE-V001/snapshot.json`): 7 lane, **không** `EDGE-LEAVE-PARKING-A`.

---

## 3. Lỗi / vấn đề + evidence

### Lỗi A — Direct goal không complete (yaw / TIMEOUT)

- **Hiện tượng:** CM OFF, một goal INBOUND → robot tới gần đích rồi TIMEOUT.  
- **Evidence (debug-100d90, run `direct-off`):**  
  - `err_xy ≈ 0.15` → `nav_xy_ok=true` (tol 0.20)  
  - `err_yaw ≈ 1.94` → `nav_yaw_ok=false` (tol 0.40)  
  - `status=TIMEOUT`, đứng ~`(1.875, 1.625)` vs goal `(1.747, 1.543)`  
  - `auth` true giữa chừng → **false** khi đứng gần goal → `cmd_vel=0`  
- **Hypotheses:**  
  1. `use_rotate_to_heading: false` → không xoay yaw đích.  
  2. Bật rotate mid-path → **regress** (kẹt south / lệch tây) — đã thử, không giữ.  
  3. Authority hết khi stall → không kịp finish yaw.

### Lỗi B — Leave path south / wall-hug pinch

- **Hiện tượng:** Planner geodesics **south** (`plan_min_y ≈ -0.89`, `trace_min_y ≈ -0.90`).  
- **Evidence:** Map có tường ngang `y∈[-0.35,-0.30]` tới `x≈-0.68`; parking south của tường → ra mid/inbound dễ đi east/south quanh pillar.  
- **Map Editor không có leave lane** → không được invent EDGE-LEAVE trong `lanes.json` làm “fix”.

### Lỗi C — CM ON false-block south mouth

- **Hiện tượng:** `FootprintApproach` zeros `cmd_vel_safe` trong khi `cmd_vel_nav` còn vx≈0.2.  
- **Evidence (run `direct-on`):** ≥100 event `cm_block` quanh `(-0.94,-0.80)`; stuck; `err_xy≈3.5`.  
- **Yêu cầu:** không tắt RPP collision / không nới safety mù để pass B.

### Lỗi D — Guided PASS gây hiểu nhầm

- Script `verify_parking_leave_inbound.py` **ép** PRE/VIA/NORTH/MID rồi INBOUND.  
- Từng thêm `EDGE-LEAVE` polyline tay — **đã revert**.  
- Coi guided PASS ≠ autonomous PASS.

### Lỗi E — Authority / reservation không bền

- Gate bật (`semantic_active`, không stage1 open-grant).  
- Direct `NavigateToPose` không đi pipeline Host job → renew grant yếu khi robot đứng.  
- Cần: giữ/renew khi Nav2 goal còn active, hoặc audit qua MQTT `NAVIGATE_TO_POSE` + Host semantic grant.

---

## 4. Hướng sửa (ưu tiên)

1. **Goal yaw không regress leave**  
   - Xoay / Spin **chỉ khi gần goal** (dist threshold), không pivot mid-path @ 0.785.  
   - Hoặc BT: FollowPath → Spin to goal yaw.  
   - DoD: direct CM OFF `status_4`, xy+yaw trong tol.

2. **Authority**  
   - Không drop `authority_ok` khi còn active NavigateToPose / gần goal.  
   - Hoặc verify qua Host command + semantic EXTEND.  
   - DoD: `auth` true tới lúc `status_4` (trừ revoke thật).

3. **CM A/B sau khi (1) PASS**  
   - Đo obstacle points / footprint tại block.  
   - Chỉnh `time_before_collision` / polygon **có số liệu**, giữ RPP collision ON.  
   - DoD: cùng direct goal PASS CM ON (hoặc CM block có giải thích geometry thật).

4. **Planner (không fake lane)**  
   - Giữ `lane_prefer` cho 7 ONE_WAY Map Editor nếu hữu ích.  
   - Không commit EDGE-LEAVE tự chế. Leave lane chỉ nếu Map Editor export thật.

---

## 5. Ràng buộc (bắt buộc)

- Không DB / không sửa Lane·Zone·Endpoint authored / không sửa PGM layout.  
- Không forced waypoint chain làm final solution.  
- Không tắt `use_collision_detection` / KEEP_OUT / ONE_WAY / Authority Gate để pass.  
- Không dual-robot cho đến khi **direct single-robot PASS**.

---

## 6. Self-audit Gazebo (Claude tự chạy)

```bash
# WSL
cd /mnt/e/programming/my_project/warotrans-system/docs/audits/gz_physical_motion

# 0) Host healthy :5090 ; lanes = 7 Map Editor codes
python3 -c "import json; print([l['code'] for l in json.load(open('/mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation/maps/map_one_v001/lanes.json'))['lanes']])"

# 1) Bringup
bash _hard_clean_sim.sh
bash _start_leave_sim.sh    # gui:=false OK
bash wait_bringup.sh

# 2) Direct CM OFF
# FootprintApproach.enabled: false trong nav2_params_sim.yaml → colcon warotrans_simulation → relaunch
# Xóa debug-100d90.log (session 100d90) rồi:
bash _run_direct_cm_off.sh
# Expect: PASS=True, status_4, err_xy≤0.20, err_yaw≤0.40

# 3) Direct CM ON
# FootprintApproach.enabled: true → rebuild/relaunch → xóa log →
bash _run_direct_cm_on.sh

# 4) Log NDJSON
# /mnt/e/programming/my_project/warotrans-system/debug-100d90.log
# Fields: progress.xy, plan_min_y, auth, cm_block, cmd_nav vs cmd_safe, end.*
```

Scripts: `verify_direct_inbound.py`, `_run_direct_cm_off.sh`, `_run_direct_cm_on.sh`.

---

## 7. Definition of Done

- [ ] Direct Parking A → INBOUND **PASS** CM OFF (Map Editor lanes, no forced hops)  
- [ ] Cùng test **PASS** CM ON (hoặc fail có evidence false-positive + fix)  
- [ ] Authority không chết trước `status_4` trên happy path  
- [ ] Báo cáo: diff code, trước/sau log, trajectory GT `/sim01/odom`  
- [ ] **Chưa** dual-robot / multi-endpoint matrix cho tới DoD trên

---

## 8. File liên quan

| Path | Vai trò |
|------|---------|
| `warotrans/.../nav2_params_sim.yaml` | RPP, inflation, CM FootprintApproach |
| `warotrans/.../maps/map_one_v001/lanes.json` | Phải = Map Editor export |
| `warotrans/.../lane_aware_navfn.cpp` | ONE_WAY + lane_prefer |
| `warotrans-system/samples/maps/MAP-ONE-V001/snapshot.json` | Source of truth edges |
| `warotrans-system/docs/audits/gz_physical_motion/verify_direct_inbound.py` | Audit direct |
| `warotrans-system/docs/audits/gz_physical_motion/verify_parking_leave_inbound.py` | Guided only — không dùng làm DoD |
