# 04 — FE-11 Architecture

## Ownership

| Concern | Owner | Notes |
|---|---|---|
| Map / zones / RouteGraph / traffic graph compile | `WaroTrans.Navigation` | Compile-time policy & topology |
| Runtime reservation, conflict, grant, quarantine | `WaroTrans.Fleet.Traffic` | In-memory `TrafficState` via actor |
| MQTT contracts | `WaroTrans.BuildingBlocks.Mqtt` | Shared DTOs/topics |
| MQTT ingress | `Fleet.Mqtt.RobotMqttIngress` → `TrafficProgressIngress` | |
| Robot plan propose / segment execute / authority | `warotrans_fleet` | TrafficClient / SemanticTrafficClient |
| Motion permission enforcement | `cmd_vel_authority_gate` | Fail-closed |
| Local path & OA | FE-06 / Nav2 | Not FE-11 |

---

## Three modes (do not merge)

### Shadow (`TrafficCoordinatorMode.Shadow = 0`)
- **Code default** in `TrafficOptions.Mode`
- V1 `TrafficCoordinator.TryAcquireRouteGrant` may dispatch whole-route NAVIGATE
- `SegmentedTrafficCoordinator` observes via shadow observer; not sole motion authority
- No wait-for cycle check in V1; offline **auto-releases** grant

### Active (`= 1`)
- **Host appsettings.json / Development default**
- RouteGraph-based segments: `RoutePlanner` + `AcquireRoute` / `AdvanceRoute` / `ExtendAtomic`
- Resources = compiled graph `TrafficResource` ids covering edge slices
- Robot: `traffic_mode=active` → `TrafficClient` + FollowPath maneuvers
- Publisher emits NAVIGATE+Authority, EXTEND, RENEW, REVOKE

### Semantic (`= 2`)
- **appsettings.Simulation.json**
- Nav2 produces `/plan` → robot MQTT `traffic_plan` → `AcquireSemanticPlan`
- Resources = `zone:{code}` + `cell:{ix}:{iy}` via `SemanticReservation.CollectResources` (horizon)
- No RouteGraph A* for grants
- Robot: `semantic_active` → `SemanticTrafficClient`
- Cleared resources → `ReportVerifiedExit`

---

## Algorithm sketch (Segmented / Semantic shared machine)

Core: `TrafficState` behind `SegmentedTrafficCoordinator` single-writer Channel.

1. **Acquire:** compute wanted resource ids → `CanAcquire` (capacity) → `WouldCreateWaitForCycle` → occupy + grant OR enqueue wait.  
2. **Conflict:** holder count ≥ capacity → wait reason Capacity; cycle → DEADLOCK_RISK reject.  
3. **Promote:** on free resources, `PromoteWaiters` by `EffectivePriority = Priority + waitedSec * AgingRate`, then EnqueueSeq.  
4. **Release:** Active progress/safe-stop extend; Semantic `ReportVerifiedExit` fail-closed physical clearance.  
5. **Authority TTL:** `AuthorityTtlSec=30`; renew interval `1.5s`; robot gate max age `0.3s`.  
6. **Offline:** `MarkOffline` → Quarantine keep occupancy; heartbeat → `MarkOnline` clears OFFLINE only.  
7. **Deadlock recovery planner:** **NOT IMPLEMENTED** (reject + wait only).  
8. **Fairness:** aging priority **IMPLEMENTED**; dual-robot E2E fairness **NOT proven**.

---

## Path from Nav2 plan to motion (Semantic)

```text
Nav2 ComputePath → /plan
  → SemanticTrafficClient.on_plan → MQTT traffic_plan
  → TrafficProgressIngress.HandlePlanProposeAsync
  → AcquireSemanticPlanAsync → TrafficState.AcquireSemanticPlan
  → TrafficEvent AuthorityGranted → TrafficAuthorityPublisher
  → MQTT EXTEND_AUTHORITY / authority payload (often EXTEND after NAVIGATE already issued)
  → SemanticTrafficClient.on_authority → authority_ok True @ ~20Hz
  → CmdVelAuthorityGate forwards /cmd_vel_safe → /cmd_vel
  → Esp32Bridge → motion
```

Active path substitutes Backend RoutePlanner segments for Nav2 plan propose, and uses EDGE_*/STOPPED_AWAITING for EXTEND.

---

## What FE-11 does vs FE-06

| Question | Answer |
|---|---|
| Who calculates path? | Semantic: Nav2; Active: Backend RoutePlanner; Legacy FE-06: Nav2 only |
| Who checks ONE_WAY? | LaneAwareNavfn + PathPolicyValidator (+ graph compile) |
| Who detects multi-robot path conflict? | `TrafficState.CanAcquire` / cycle check |
| Who owns reservation? | Fleet `TrafficState` (memory) |
| Who grants movement? | Fleet coordinator + MQTT authority commands |
| Who enforces? | CmdVelAuthorityGate (+ SafetySupervisor active) |
| Who stops for dynamic obstacle? | Nav2 costmaps/RPP/CM (FE-06) |
| Who decides job complete? | WorkflowExecution / command_result — not TrafficState alone |

---

## SDD recommendation

Document **all three modes** as supported implementations, with **Active** as Host default and **Semantic** as Simulation profile. Primary FE-11 sequence diagrams should pick **one primary mode** (recommend Semantic for Stage-3 SDD narrative **or** Active for RouteGraph narrative) and footnote the other modes—never blend resource models.
