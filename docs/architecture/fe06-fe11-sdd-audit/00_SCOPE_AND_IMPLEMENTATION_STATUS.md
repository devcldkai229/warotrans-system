# 00 — Scope and Implementation Status

**Inspection timestamp:** 2026-11-03 15:15:05 +07:00  
**warotrans-system SHA:** `d1ee6c4cd62f499b5b46b078cc3827d8f97ff34d`  
**warotrans SHA:** `b0e97552535ad3ce4cf3a6cd56930b5a73125465`  
**Audit type:** Read-only source inspection (no runtime/sim/DB changes)

---

## Feature scope

| Feature | SDD requirement | In-scope software |
|---|---|---|
| **FE-06** | Autonomous navigation & obstacle avoidance | Robot Nav2 stack, gateway NavigateToPose/FollowPath clients, sensors/localization/hardware, LaneAwareNavfn overlay, Collision Monitor / costmaps, MQTT command/result telemetry |
| **FE-11** | Coordinate robots & resolve path conflicts | Backend Fleet traffic coordinators, Navigation traffic graph compile, MQTT authority/plan/progress, robot TrafficClient / SemanticTrafficClient, Authority Gate, PathPolicyValidator |

**Integration boundary:** FE-06 owns local planning/control/obstacle handling. FE-11 owns multi-robot resource reservation and motion *permission*. FE-11 does not replace Nav2 obstacle avoidance.

---

## Implementation status summary

| Feature | Code existence | Unit tests | Live Gazebo / dual-robot | Verdict for SDD |
|---|---|---|---|---|
| FE-06 legacy NavigateToPose | **IMPLEMENTED** | Robot/unit coverage partial | Single-robot motion exercised in audits; readiness mixed | Document as **IMPLEMENTED** with Nav2 framework OA; low-obstacle ultrasonic **PARTIAL** |
| FE-06 LaneAware / filters | **CONFIGURATION-DEPENDENT** | Plugin + adapter tests | Sim-heavy | Document as optional overlay |
| FE-11 Shadow | **IMPLEMENTED** (default in `TrafficOptions`) | Yes | Observes; V1 grants | Document as mode |
| FE-11 Active (RouteGraph segments) | **IMPLEMENTED**; Host appsettings default **Active** | Strong unit/regression | Dual E2E NOT fully PASS | Document as mode |
| FE-11 Semantic | **IMPLEMENTED**; Simulation profile **Semantic** | Unit semantic PASS | Dual Stage-3: grants PASS, goals FAIL/NOT_RUN | Document as mode; **do not claim dual-robot PASS** |

---

## Active vs legacy / simulation-only

| Item | Status |
|---|---|
| `traffic_mode=legacy` + NavigateToPose | Active FE-06 primary path |
| `traffic_mode=active` + FollowPath segments | FE-11 Active robot path |
| `traffic_mode=semantic_active` | FE-11 Semantic robot path |
| RouteGraph compile | **ACTIVE** substrate (not retired) |
| Semantic “no RouteGraph A*” | Runtime grant path only |
| `warotrans_simulation` + semantic_map_adapter | **SIMULATION-ONLY** package location (adapter may be reused) |
| Authority gate default OFF in navigation.launch | **CONFIGURATION-DEPENDENT** |
| Ultrasonic → costmap | **NOT IMPLEMENTED** / PARTIAL |

---

## Important architectural limitations

1. Obstacle avoidance for unexpected obstacles is primarily **Nav2 framework** (costmaps, RPP, Collision Monitor, BT recoveries)—not a custom WaroTrans OA algorithm.
2. FE-11 has **three modes**; algorithms and resource models differ—do not unify into one fictional design.
3. Deadlock handling = **reject acquire that would create wait-for cycle** + wait/promote; no separate deadlock recovery planner.
4. Dual-robot physical acceptance is **not PASS** in current audit docs.
5. Authority is **TTL-bounded** (default 30s) with renew; gate fails closed on stale `authority_ok` (max age 0.3s).
6. Traffic occupancy/authority state is **in-memory** on Backend (not PostgreSQL TrafficReservation entities).
