# ADR 0010 — Robot Traffic Client (reservation-gated Active Mode)

## Status

Accepted (2026-10-25). Defaults remain **Shadow** / **legacy** until hardware approval.

## Context

Shadow Mode (ADR 0009) validates segmented authority on the backend while V1 still
dispatches whole-route NAVIGATE. Active Mode must gate robot motion on Motion Authority
end-to-end: backend issuer → MQTT → robot Traffic Client → FollowPath on granted edges
only → progress uplink → verified exit.

## Decision

1. Backend `Traffic:Mode=Active` uses `SegmentedTrafficCoordinator` as the sole issuer.
   `TrafficAuthorityPublisher` emits `NAVIGATE_TO_POSE`+`authority` then `EXTEND_AUTHORITY`.
2. Robot `traffic_mode:=active` rejects NAVIGATE without authority; runs
   ComputeRoute + FollowPath (no BT recoveries); reports `traffic_progress` /
   `authority_state`.
3. Local `SafetySupervisor` (20 Hz) + optional `cmd_vel_authority_gate`
   (`enable_authority_gate:=false` by default) add soft stops; ESP32 300 ms watchdog
   remains the final motor gate.
4. Path hash = `sha256(graphHash|id,id,...)` — identical on C# and Python.

## SAFETY REVIEW

| Field | Content |
|-------|---------|
| WHY | Authority gating so robots cannot enter ungranted junctions |
| FILES | `warotrans_fleet` (client, store, supervisor, gate), `navigation.launch.py`, Fleet Traffic publisher/ingress |
| RISK | Gate could zero valid motion or fail open if miswired; Active without nav2_route cannot run |
| TEST | Unit tests; sim scenarios; wheels-lifted hardware only after operator approval |
| ROLLBACK | `traffic_mode:=legacy`, `enable_authority_gate:=false`, `Traffic:Mode=Shadow`, `git checkout pre-traffic-active`, Pi `rollback_source.sh` |

## Consequences

- Dual stack until post-hardware cutover: Shadow default, Active opt-in.
- No TransportMovement / TrafficReservation persistence.
- No ESP32 / TF / calibration changes.
