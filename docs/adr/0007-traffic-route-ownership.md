# ADR 0007 — Traffic route ownership (Backend graph → Nav2 Route Server)

**Status:** Accepted  
**Date:** 2026-10-24  
**Related:** ADR 0005 (MQTT command protocol), robot commit `a3163d8` (Nav2 Route Server BT)

## Context

WaroTrans needs multi-robot traffic control on semantic lanes (Edges) and Zones.
The robot stack on ROS 2 Jazzy already includes `nav2_route` 1.3.13 with
`ComputeRoute` / `ComputeAndTrackRoute` and BT `navigate_to_pose_route.xml`
(no free-space planner fallback when `route_graph:=` is set).

Two candidate ownership models:

1. **Backend CompiledTrafficGraph** is Source of Truth; Nav2 Route Server only
   executes an authorized edge chain (`FollowPath` on the densified route).
2. Backend sends a dense path; gateway drives `FollowPath` directly (no Route Server).

## Decision

**Option 1.** Backend owns topology, validation, reservation, and grants.
Nav2 Route Server consumes the GeoJSON export of the same compiled graph
(stable node/edge ids + `graphHash`) and runs `ComputeRoute → FollowPath`.

Mandatory conditions:

- Only the backend Traffic Coordinator may grant Edge/Zone use.
- The Nav2 route must match the granted edge-id sequence exactly; otherwise reject
  (`ROUTE_NOT_AUTHORIZED`) — no autonomous replan onto other edges.
- The robot may FollowPath only inside the authorized corridor (footprint + path).
- On grant loss, MQTT disconnect, or invalid route: stop safely and report.
- Do not run two independent routing authorities that can both move the robot.
- Integration tests must prove Nav2 cannot execute through an ungranted edge
  (`DynamicEdgesScorer/adjust_edges` closes non-granted edges).

When `route_graph` is not launched, legacy free NavigateToPose remains for
backward-compatible single-robot E2E (MOVE / HUMAN_CONFIRM already verified).

## Consequences

- Fleet MQTT `NAVIGATE_TO_POSE` payload gains optional `route { graphHash, edgeIds[] }`.
- Gateway must load the same graph hash as the backend export.
- Progressive / stopline grants are deferred (see ADR 0008); V1 is whole-route atomic.
