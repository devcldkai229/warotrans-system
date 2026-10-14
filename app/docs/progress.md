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
  - [ ] Connect SignalR notification hooks when backend websocket hub is online.

## Workspace & Documentation Maintenance Rules
1. **Strict Local Boundaries**: Work strictly inside `warotrans-system/` (`app/` and `backend/`). Do not look into or rely on external folders (`WaroTrans-specs`).
2. **Synchronized Documentation**: Maintain and update `AGENTS.md` and all files in `app/docs/` after every code modification to prevent context drift across conversations.
