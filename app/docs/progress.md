# WaroTrans Mobile App — Progress

Updated 2026-10-17. Design language: Calm Operations. Scope: `app/` only.

## Completed: Mobile Backend Realignment

Both implementation waves are complete. [MOBILE_BACKEND_REALIGNMENT.md](./MOBILE_BACKEND_REALIGNMENT.md) records the requirement matrix, server capability boundaries and validation limits.

- API clients preserve empty results and real errors; all operational seeds, local receipts, phantom task APIs and in-memory slot reservations are removed.
- Authentication requires verified server identity. Refresh/logout and local session persistence use generation guards and serialized storage. Logout resets navigation and job badges.
- Realtime starts empty, generates operational notifications, retries initial failures, serializes restarts and resyncs REST snapshots without replacing newer events.
- Jobs follow the real state machine, use robot UUID starts and barcode-to-UUID handover confirmation, display all containers and all step types, and retain server errors in the confirmation modal.
- Transport uses real catalogs and workflow schemas, typed staff input, actual container sources and explicit destinations. Create/Queue/Start receipts survive partial failure. Lists query associated jobs and repeat from detail data.
- Inventory and receiving use real product/container fields and the three receiving endpoints, with a clear unmapped server route banner.
- Facility maps render actual images, geometry, active jobs and calibrated robot poses. Safety cancellation reports the pending robot acknowledgement honestly. Unsupported Operations actions are disabled with explanations.
- All migrated screens use the shared primitive barrel, inset-aware headers and measured dock clearance. Primary action fills use the mandated accessible cobalt token.

## Validation

- TypeScript: zero errors from `npm run typecheck`.
- Regression suite: 31 passing checks from `npm run test:realignment`.
- Expo web export: passed.
- Expo startup: Metro running on port 8088; local HTTP 200 confirmed. Optional native DevTools launch is unsupported in this environment.
- Browser UI/end-to-end: unavailable because no browser is connected and the backend is not reachable. No live robot or backend mutation was asserted.
- Scope review: all tracked/untracked task files are under `app/`; backend and Web Admin are unchanged.

## Server Work Outside This Task

Warehouse receiving handlers exist but are not mapped in the inspected server module. Receiving will surface an honest 404/405 capability error until the server registers those routes. Operations reporting/recovery/hold/sync endpoints are unavailable. These server changes are outside the authorized scope and were not made.


Transport movement derivation is covered independently: actual container location takes precedence over manual source input; absent sources require explicit endpoints; destination storage must match its endpoint; required dotted schema paths are validated.
