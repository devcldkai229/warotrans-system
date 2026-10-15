# WaroTrans App UI/UX & Architecture Progress Log

## Session Info
- Latest Update: 2026-10-15
- Branch: `feature/mobile-ui-redesign`
- Design Language: **Calm Operations** (Google Cloud Console / Linear enterprise ergonomics)

## Phase Status Summary
- [x] **Phase 1: Foundation & Primitives**
  - Theme palette (`#eef1f6` canvas, `#1557d0` cobalt accent, `#121317` textPrimary, `border` 0.08 alpha).
  - Primitive library barrel in `src/shared/ui/` (`Button`, `Card`, `Text`, `StatusPill`, `SegmentedControl`, `TextField`, `ProgressMeter`, `EmptyState`).
  - Safe-area inset hooks (`useTopInset()`, `dockReservedSpace()`).

- [x] **Phase 2: Shell & Pilot Screens**
  - `BottomTabBar`: 3 core tabs (`Home`, `Jobs`, `Transport`), icon-only, soft pill highlight.
  - Active jobs counter badge calibrated: bright warm Amber-400 (`#fbbf24`), 1.5px white border (`#ffffff`), and deep amber text (`#78350f`).
  - `AppHeader`: 56px content row, 2-tier info column (monochrome `BrandMark` 40px + Title `WaroTrans` 16pt bold + Zone Selector `📍 Inbound Dock 01 ▾`), right action cluster (`Search`, `Notification Bell`, `Avatar`).
  - Modals: `ZonePickerModal`, `AccountSheet`, `SafetyActionSheet` over `SheetDialog`.
  - Pilot screens: `HomeScreen`, `JobsScreen`, `JobCard`.

- [x] **Phase 3: Operations Core & Live Map Overhaul**
  - `JobDetailScreen`: 3-slot AMR chassis deck, interactive handover stepper, soft-hold simulation.
  - `JobLiveMapScreen`: Full Calm Operations migration with `SubScreenHeader` (Back navigation + Recenter action), true SVG Nav2 waypoint trajectories (connecting Dock 01 exit to central aisle and Rack A without cutting Loading Docks), and collision-free robot markers (`AMR-01` in central aisle, `AMR-02` in upper-right standby bay).
  - `MiniFacilityMap`: Zero text-wrap on robot labels, smooth radar sweep and pulse waves.

- [x] **Phase 4: Backend Alignment & System Review**
  - OpenAI Codex CLI gap analysis completed: verified .NET 10 backend contracts vs mobile requirements.
  - Documented missing REST execution endpoints vs existing Queue/Get controllers.

- [x] **Phase 5: Notification Center & Enterprise Action Cluster**
  - [x] Header Layout: `BrandMark` (40px) + Work Zone Selector pill (`📍 Inbound Dock 01 ▾`, 40px) on left (removed redundant "WaroTrans" text).
  - [x] Action Cluster on right: Notification Bell (`Bell`, 40px with badge count `3`) + Operator Avatar (`Avatar`, 40px solid black). Search button removed to eliminate header crowding (inventory lookup moved to Transport).
  - [x] Implemented compact anchored dropdown `NotificationSheet.tsx`: Drops down right beneath the header bell (`320px` width, `topInset + 54`), 100% English copy, unread counter, "Mark all read", and operational warehouse alerts (`ROBOT_ARRIVED`, `HAZARD`, `JOB_ASSIGNED`, `BATTERY_LOW`).

- [x] **Sprint 2: Task WTCP-60 — Connect Staff App TransportRequest Flow to Real Backend APIs**
  - Branch: `feature/WTCP-60-connect-transport-request-flow-api`
  - Created robust API client foundation in `app/src/shared/api/` matching .NET 10 DTOs:
    - `client.ts`: Base fetcher with JWT bearer authorization, base URL resolution, and `ProblemDetails` error handling (`ApiError`).
    - `transportApi.ts`: `createTransportRequest`, `queueTransportRequest`, `listTransportRequests`, `getTransportRequest`.
    - `warehouseApi.ts`: `listWarehouses`, `listContainers`, `getContainerByBarcode`, `listStorageLocations`.
    - `workflowApi.ts`: `listPublishedWorkflows`, `getWorkflow`, `getWorkflowRequestInputSchema`.
    - `navigationApi.ts`: `listMapVersionsForWarehouse`, `getMapVersionDetail`, `getActiveMapVersion`.
  - Upgraded `TransportCreationScreen.tsx`:
    - Dynamic retrieval of published workflows, active warehouse, map version, and endpoints.
    - Container barcode lookup and slot assignment.
    - Full payload submission (`createTransportRequest`) and runtime job generation (`queueTransportRequest`).
    - Real dispatched order receipt display with direct links to Live Map and Transport History.
  - Upgraded `TransportHistoryScreen.tsx`:
    - Dynamic query via `listTransportRequests({ take: 50 })`.
    - `RefreshControl` pull-to-refresh with status mapping (Submitted, Queued, Planning, En Route, Delivered, Cancelled).
  - Upgraded `TransportScreen.tsx`:
    - Live feed of recent dispatches dynamically queried from backend.
  - Zero TypeScript compiler errors (`npm run typecheck` passed).

- [x] **Sprint 2: Task WTCP-61 — Build Staff Human Work Queue Accept and Confirm UI**
  - Branch: `feature/WTCP-61-build-staff-work-queue-accept-confirm-ui`
  - Created execution API client in `app/src/shared/api/executionApi.ts`:
    - `acceptHumanTask`: Claims human task step from queue.
    - `confirmHandover`: Records `HandoverConfirmation` with `jobStepId`, `containerId`, `confirmedBy`, and `handoverType`.
    - `reportTaskProblem`: Submits issue/hazard report for a task.
  - Enhanced `contracts.ts` with `HandoverType` enum matching backend C# 1:1.
  - Upgraded `JobsScreen.tsx`:
    - Staff work queue dual-view with reactive `jobsList` state.
    - Added "Accept Task" workflow: operators can browse the Available Fleet Queue and claim tasks with 1 tap, automatically transferring them into "My Tasks" with dynamic active badges.
  - Upgraded `JobCard.tsx`:
    - Dual-action button cluster ("Accept Task" + "Details") on unassigned tasks in the fleet queue.
  - Upgraded `VerifyModal.tsx`:
    - Direct integration with `confirmHandover` API during barcode verification.
    - Supports `jobStepId`, `operatorId`, loading states, and haptic feedback.
  - Upgraded `JobDetailScreen.tsx`:
    - Integrated `reportTaskProblem` for supervisor alert escalation and AMR safety pause.
  - Zero TypeScript compiler errors (`npm run typecheck` passed).

- [x] **Sprint 2: Task WTCP-62 — Connect Staff Request and Job Tracking to Realtime Backend**
  - Branch: `feature/WTCP-62-connect-request-job-tracking-realtime`
  - Integrated SignalR realtime client in `app/src/shared/realtime/`:
    - `realtimeClient.ts`: Strongly typed connection to `/hubs/notifications` subscribing to `robotConnectivityChanged`, `robotTelemetryUpdated`, `notificationReceived`, and `transportRequestStatusChanged`.
    - Auto-reconnect with exponential backoff and bearer token injection.
    - `RealtimeContext.tsx`: App-wide realtime provider tracking live robot telemetry, connectivity status, unread alert counter, and instant notification distribution.
  - Connected Realtime Data to Handheld UI:
    - `NotificationSheet.tsx`: Real-time streaming of incoming alerts and instant badge counter synchronization.
    - `AppHeader.tsx`: Dynamic live notification count on the bell button.
    - `HomeScreen.tsx` & `MiniFacilityMap.tsx`: Live AMR battery percentage, speed, and heading orientation dynamically driven by backend telemetry.
    - `JobLiveMapScreen.tsx`: Real-time robot coordinates `(poseX, poseY)`, battery, and navigation state.
- [x] **Phase 6: UI Streamlining & Calm Ergonomics (Removing Verbose Filler)**
  - `TransportScreen.tsx`: Trimmed descriptive annotations from "Dispatch History & Audit Log" and "Inventory & SKU Catalog"; removed subtitles from Hero buttons ("New Request", "Pack Container") and Floor Safety strip ("Soft Hold", "Block Path") to deliver a clean industrial cockpit.
  - `TransportCreationScreen.tsx`: Removed header subtitle under "Available Mission Templates" (*"Choose a predefined orchestration pattern for autonomous AMR movement."*).
  - `WorkflowTemplateCard.tsx`: Redesigned into tactile action tiles (Option A) — removed redundant capsule badges (`INBOUND`, `OUTBOUND`, etc.) and replaced them with an elegant `ArrowUpRight` (↗) affordance circle, balancing card proportions and eliminating the hollow gap.
  - `SafetyHubCard.tsx`: Streamlined header and removed verbose action descriptions, aligning standalone safety controls with calm minimal tokens.
  - `BlockPathHazardScreen.tsx`: Removed 3-line boilerplate banner and hazard category subtitles (`desc`), bringing all corridor selection and hazard tiles above the fold.
  - `PointToPointScreen.tsx`: Streamlined "Quick Preset · Return Empty Totes" into a sleek single-row 1-tap trigger.
  - `PayloadRecoveryScreen.tsx`: Removed redundant subtitle from incident alert, shortened Step 1 dispatch instruction, and resolved text collision layout bug in stranded cargo card with a clean stacked layout.
  - `IssueReportingModal.tsx`: Removed multi-line category descriptions and helper text, reducing modal height by ~40% for frictionless one-tap exception submission.
  - Zero TypeScript compiler errors (`npm run typecheck` passed).

## Workspace & Documentation Maintenance Rules
1. **Strict Local Boundaries**: Work strictly inside `warotrans-system/` (`app/` and `backend/`). Do not look into or rely on external folders (`WaroTrans-specs`).
2. **Synchronized Documentation**: Maintain and update `AGENTS.md` and all files in `app/docs/` after every code modification to prevent context drift across conversations.

