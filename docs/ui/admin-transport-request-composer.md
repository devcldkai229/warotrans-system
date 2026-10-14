# Admin Transport Request Composer

UI-only creation experience on **Monitor → Transport requests** (`/monitor/requests`).

Does **not** call TransportRequest APIs, Planner, Jobs, robots, or inventory mutation.

## Layout

When idle: left request list (400px) + Facility Map.

When **+ New request**:

| State | Columns |
|-------|---------|
| Panel 1 only | Request setup (~320–360px) + Map |
| After workflow selected | Panel 1 + Movement builder (~430–500px) + Map |

Top navigation (`AppShell`) unchanged. Closing restores the request list exactly.

## Panel 1 — Request Setup

- Warehouse (required)
- Map — published maps for selected warehouse (fixture)
- Workflow cards → compact selected card (code · version · Published)
- Dynamic **Workflow parameters** from workflow metadata (excludes container/source/destination keys)
- Requested by (read-only), Note (optional)
- Initial state hint: `SUBMITTED` (not editable)
- Demo preset chips A–E for manual QA

## Panel 2 — Movement Builder

Workspace with sticky header / scroll body / sticky footer.

Modes:

1. **Build** — movement cards, bulk actions, list/grouped toggle
2. **Select containers** — search + filters, multi-add
3. **Review** — summary + Create (mock)

Actions: Add container, Scan barcode (placeholder disabled), Set same source/destination, Remove selected.

## Generic Movement Model

```ts
TransportRequestDraft { warehouseId, mapVersionId, workflowId, workflowInputs, note, movements[] }
MovementDraft { localId, sequenceNo, containerId, source*, destination* }
```

No per-workflow movement subclasses. Structure is always Container + Source → Destination.

## Workflow Parameter Rendering

Renders `ADMIN_INPUT` / `STAFF_INPUT` variables from fixture schema, excluding movement keys (`containerId`, `source*`, `destination*`).

If none: “No additional request parameters.”

## Container Selector

In-panel list (not a tiny dropdown): barcode, product, current location/level/endpoint, status. Search + Location / Status / Product filters.

## Source/Destination UX

- **Location-backed**: pick StorageLocation (+ level) → endpoint auto-resolved read-only
- **Direct endpoint**: INBOUND / OUTBOUND / PARKING / TRANSIT / INSPECTION
- Auto-fill source from container inventory when present
- Optional map pick: click Endpoint while source/destination map mode is active

## Map Preview

`WarehouseMap` receives draft-derived `focusEndpointIds`, dashed `movements` (sequence badges), and callouts (`SOURCE`, `DESTINATION`, shared counts).

Legend: **Preview only — final robot route is planned after submission.**

No Nav2 path planning.

## Supported Scenarios

| Id | Pattern | Demo |
|----|---------|------|
| A | 1 source → many destinations | Inbound distribution |
| B | Many sources → 1 destination | Outbound collection |
| C | Many → many | Multi relocation |
| D | Same → same (N containers) | Bulk same lane |
| E | Single movement | Point-to-point |

Shared source/destination banners are presentation only; each movement still stores its own source/dest.

Grouped view aggregates by source for reading — **not** a JobBatchPlan / stop order.

## Review Mode

Shows workflow, warehouse, map, movements, parameters, note.

**Create request** → `submitTransportRequest(draft)` mock (`console.info` + toast banner). Marked `TODO(backend): POST TransportRequest`.

## Mock Data

| File | Role |
|------|------|
| `web/src/features/transport-requests/composer/fixtures.ts` | Warehouses, maps, workflows, containers, locations |
| `web/src/features/transport-requests/composer/demoScenarios.ts` | Presets A–E |
| Reuses | `management/mock`, `maps/mock`, `shared/map/scene` |

## Future API Integration Boundary

- `useTransportRequestComposerData()` — swap fixture for API reads
- `submitTransportRequest(draft)` — swap for POST TransportRequest + details

UI components should not need a rewrite when the adapter changes.

## Screenshots / manual verification

1. **+ New request** → Panel 1; list replaced; map visible
2. Choose Workflow → Panel 2 opens
3. Add 3 containers → 3 cards; source auto-fill when inventory present
4. Shared source + independent destinations (preset A)
5. Many sources + shared destination (preset B)
6. Generic many→many (preset C)
7. Same lane (preset D); single (preset E)
8. Map highlights source/destination; pick mode sets endpoint
9. Review matches draft; Back preserves draft
10. Close with dirty draft confirms discard; list restored

## Non-goals

No backend POST, Planner, JobBatchPlan, robot assignment, MQTT, TrafficCoordinator, barcode hardware, route calculation.
