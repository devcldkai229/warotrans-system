# Dual-robot results (Stage 3 — Live Motion Recovery)

**Updated:** 2026-11-01  
**Mode:** `Traffic:Mode=Semantic` · `semantic_active` gateways · no `stage1_open_grant` · no Transport Jobs  
**Backend:** Simulation profile `:5090` · MQTT mosquitto `:1883`  
**Fingerprint:** `6dd72df135c22c33bcc620575d0d222b686953910b953b8f216d992431f27ff0`  
**Gazebo:** `gui:=true` · starts **EP-PARKING-A / EP-PARKING-B**

## Bringup

| Check | Result |
|---|---|
| Dual/single Gazebo + namespaced Nav2 ACTIVE | **PASS** (with `nav_start_delay:=40`) |
| LaneAwareNavfn | **PASS** |
| Gateways `traffic_mode=semantic_active` + `authority_ok_hz=20` | **PASS** |
| Semantic grants after HB ONLINE | **PASS** (post MarkOnline fix) |

## Scenario matrix (recovery A–F)

From `DUAL_MOTION_RESULTS.csv` + sync traces + backend log:

| Test | Robot | Start → Goal | Status | Displacement | Notes |
|---|---|---|---|---|---|
| **A** | SIM-01 only | EP-PARKING-A → EP-INBOUND | **FAIL** TIMEOUT | **0.922 m** | Grants OK (`granted=True`); `authority_ok=True` ×722; cmd_vel forwarded intermittently; Nav2 stalls short of goal |
| **B** | SIM-02 | EP-PARKING-B → EP-OUTBOUND | **NOT_RUN** | — | Safety gate: blocked by A |
| **C** | both | independent corridors | **NOT_RUN** | — | blocked by A |
| **D** | both | SINGLE_OCC | **NOT_RUN** | — | blocked by A |
| **E** | both | unmarked cross | **NOT_RUN** | — | blocked by A |
| **F** | SIM-01 | replan/cancel | **NOT_RUN** | — | blocked by A |

**pass=0 / executed=1 (A FAIL).** Do **not** claim Stage-3 dual PASS.

## Trace evidence (Test A)

- Sync CSV: `runtime/sync_motion_trace_a.csv`
- Backend: `backend_sim_recovery3.log` — `connectivity ONLINE` then `traffic_plan … granted=True` (rev 1…11)
- First blocker **fixed**: event-driven `authority_ok` starved gate (0.3 s max_age) → now ≥20 Hz while grant valid
- Second blocker **fixed**: sticky OFFLINE from bringup HB gap → `MarkOnline` on verified heartbeat (not `traffic_plan`)
- Remaining blocker: **Nav2 local execution** after ~0.9 m (controller/CM progress) with authority still open — not a grant false-negative

## Prior dual-peer run (diagnostic)

With both robots at Parking A/B (~0.4 m apart), SIM-01 was physically blocked by SIM-02; Test A now uses `robots:=sim01` only.

## Key fixes this recovery

1. Semantic `authority_ok` ≥20 Hz + path-fingerprint debounce + grant re-propose cooldown  
2. Semantic occupancy diff-release + `ReportVerifiedExit` without RouteGraph + waiter promote  
3. Remove `traffic_plan` auto-clear of OFFLINE/LOCALIZATION_LOSS; clear OFFLINE only via heartbeat `MarkOnline`  
4. `robots:=sim01|sim02|both` launch arg for standalone acceptance  

## Stage-3 dual acceptance

**FAIL** — standalone semantic grant+gate proven; goal completion under Semantic Traffic not yet achieved for ParkingA→INBOUND within 180 s.
