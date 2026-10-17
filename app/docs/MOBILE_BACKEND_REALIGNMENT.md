# Mobile App Backend Realignment

Implemented 2026-10-17 within `warotrans-system/app/` only. No backend or Web Admin files are modified. Local backend source and Web Admin API/map helpers were inspected read-only as the reference for PR #41 and container receiving.

## Wave 1

| Area | Implemented Behavior |
| :--- | :--- |
| API errors | Normalizes `{path,message}`, `{property,code,message}` arrays and ASP.NET ValidationProblem dictionaries into ApiError. |
| Refresh/session | Shared refresh, generation guard, serialized storage writes and clearing, auth listener notification on failure; stale refresh cannot restore a logged-out or newer session. |
| Authentication | Login or verified `/identity/me` establishes identity. No offline preset or query-string authentication. Failed verification clears cached identity. |
| Zone/shift | Device display preference only; no fake server shift hours. |
| Operational clients | Empty server envelopes pass through unchanged. GET/mutation failures propagate. No seeds, local provisioning, generated receipts, phantom task endpoints or slot reservations. |
| Warehouse | Real product resolve, inventory context, container detail/barcode lookup and receiving DTO/client. |
| Workflow | Correct versionNo, publishedAt, createdBy and DRAFT/PUBLISHED contracts. STAFF_INPUT schema clients. |
| Fleet | Supported filters only; cancel body contains targetCommandId. Enable, disable, navigate and teleop clients use real routes. |
| Navigation | Full calibrated map metadata and geometry retained; ROS world/image transform matches Web Admin including origin yaw. |
| Realtime | Empty initialization; event-derived notifications; serialized lifecycle; initial retry; reconnect REST resync; stale event/session guards. |

## Wave 2

| Area | Implemented Behavior |
| :--- | :--- |
| Jobs | Server summaries/details, real robot selection and start for CREATED/QUEUED. No phantom staff task acceptance. |
| Handover | RUNNING/current WAITING HUMAN_INTERACTION pickup/dropoff only. Barcode resolves to UUID and must match expected container. Real UUID confirmation posts `{containerId,note}` and applies returned JobDetailDto. Errors stay in modal. |
| Graph/cargo | Every container and CHECK/MOVE/HUMAN_INTERACTION/WAIT step renders with UUID keys. No invented two-bay limit, quantities or task-release/nudge/hold outcomes. |
| Transport creation | Active warehouse/map, real eligible containers and locations, published workflow/schema, typed staff variables, actual sources and explicit destinations. No local occupancy model. |
| Lifecycle | Submit, Queue and Start are distinct; Submit & Run performs all sequentially. Partial failure retains receipts and reports exact stage. One robot starts one job; further jobs remain visible to start later. |
| Landing/history | Real request lists, associated jobs by transportRequestId, queue/start controls, detail-based Run Again, map-change review notice. |
| Inventory | Real barcode/status/product/location/level and UUID+barcode relocation parameters. |
| Receiving | Resolve → Inventory Context → Create. Unmapped 404/405 routes explain missing WarehouseModule registration. |
| Home/map | Real map image, geometry, active jobs and robot telemetry; ROS conversion, real timestamps and explicit stale/unavailable labels. |
| Fleet cancel | Active currentCommandId only; HTTP 202 displayed as Cancel Requested (Awaiting Robot ACK). |
| Unsupported operations | Reporting, hazards, recovery, hold and offline sync are visibly unavailable. Manual/scanner input replaces simulated camera results. |

## Server Capability Limit

The inspected `WarehouseModule.MapWarehouseEndpoints` registers list/get routes but does not map ResolveProductEndpoint, GetProductInventoryContextEndpoint or CreateContainerEndpoint. The mobile clients and receiving UI are implemented, but this server deployment must register those routes before receiving can succeed. Backend files are intentionally unchanged.

Operations reporting, hazard rerouting, payload transfer, nearby robot hold and offline mutation queuing have no supported current endpoint. The app does not imply those actions were performed.

## Verification

- `npm run typecheck`: zero TypeScript errors.
- `npm run test:realignment`: 31 regression checks covering wire requests, empty/error responses, authentication, refresh/logout/storage races, lifecycle partial failures, handover modal failures/success, all cargo/step rendering, stale snapshot ordering, map calibration and realtime behavior.
- `npx expo export --platform web --output-dir dist`: successful web export.
- `npx expo start --web --port 8088`: Metro starts; HTTP 200 confirmed. Optional native React Native DevTools launch fails in this environment without preventing Metro startup.
- No connected browser and no reachable running backend were available for live end-to-end or robot acknowledgement testing. Automated tests use controlled HTTP/SignalR/storage boundaries; they do not assert live robot execution.

The default sandbox prohibits local listeners. Expo startup and the local HTTP check were performed through approved local execution. Generated web output stays in ignored `app/dist/`.
