# ADR 0008 — Traffic grant V1 (atomic whole-route)

**Status:** Accepted  
**Date:** 2026-10-24  
**Related:** ADR 0007

## Context

Critical corridors (JUNCTION / SINGLE_OCCUPANCY / NO_STOP segments) and shared
bidirectional lanes need exclusive or capacity-limited use. Progressive grants
(stopline-by-stopline) reduce blocking but risk hold-and-wait deadlock.

## Decision (V1)

- **Atomic whole-route grant:** request all resources for the shortest path from
  current node to destination endpoint in one transaction (all-or-nothing).
- **FIFO wait queue** per contended resource (deterministic order by enqueue time,
  then robot id).
- **Release** when `command_result` arrives or heartbeat timeout marks robot offline.
- JobStep stays `EXECUTING` while waiting for a grant (not a business WAIT step).
- Resources are **in-memory only** (no `TrafficResource` / `TrafficReservation` tables).

## Out of scope (later)

- Progressive grant with stoplines.
- Multi-instance distributed coordinator (V1 assumes single Host).

## JUNCTION semantics

`ZoneType.JUNCTION` is the primary junction conflict group (capacity = 1,
free motion inside to transition). `SINGLE_OCCUPANCY` / `NO_STOP` still form
junction links for backward compatibility, with compile warning
`LEGACY_JUNCTION_ZONE`.
