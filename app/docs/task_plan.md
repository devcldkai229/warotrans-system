# Autonomous Goal Plan: Comprehensive UI/UX Upgrade for Job & Transport Groups

## Goal
Conduct a thorough, pixel-perfect UI/UX audit and upgrade across the **Jobs System** and **Transport System** (including all sub-screens, modals, HUDs, and popups) in `warotrans-system`. Achieve 1:1 aesthetic parity with `ui-design-prototype/prototype-staff-web` while elevating the design to Silicon Valley enterprise standards (tactile depth, refined typography, exact color tokens, micro-interactions, responsive aspect-ratios, and flawless popup/modal rendering).

---

## Phases & Execution Checklist

- [x] **Phase 1: Initial Working Memory & Environment Health**
  - [x] Create `task_plan.md`, `findings.md`, `progress.md`
  - [x] Confirm clean build state, zero typecheck errors
  - [x] Inventory current styling divergence between prototype and React Native code

- [x] **Phase 2: Job Screen System & Associated Modals Audit & Upgrade**
  - [x] **2.1 `JobsScreen.tsx` & `JobCard.tsx`**
    - Audit tabs (My Jobs, Global Pool, History, Empty Totes) with counter badges
    - Filter bar, search input, tactile button styling, priority tags, progress bar colors
    - Empty states & quick refresh action
  - [x] **2.2 `JobDetailScreen.tsx` & `JobStepper.tsx`**
    - Task header with ETA, status badges, and navigation actions
    - Step-by-step handover timeline with live pulse markers
    - Action footer (Start Handover, Report Exception, View Live Map)
  - [x] **2.3 `AmrChassisDeckVisualizer.tsx` & `ContainerSlotCard.tsx`**
    - 3-slot top-down AMR chassis layout (Slot 1 Front, Slot 2 Center, Slot 3 Rear)
    - Active slot neon blue glow, status tags, barcode chips, container details
  - [x] **2.4 Modals in Job Flow (`VerifyModal.tsx`, `IssueReportingModal.tsx`, `BarcodeScannerHUD.tsx`)**
    - Handover verification modal: camera reticle, barcode match/mismatch states
    - Exception reporting modal: issue category grid, photo evidence trigger, notes
    - Aspect ratio, backdrop blur, keyboard avoiding behavior, touch dismissal

- [x] **Phase 3: Transport System & Workflow Hub Audit & Upgrade**
  - [x] **3.1 `TransportScreen.tsx`, `WorkflowTemplateCard.tsx`, `SafetyHubCard.tsx`**
    - Header telemetry summary and "+ New Transport Request" hero banner
    - Routine Workflows grid (Inbound Putaway, Outbound Retrieval, Reallocation, P2P)
    - Safety Hub grid (Payload Rescue, Fleet Recall, Replenishment, Block Path)
  - [x] **3.2 `TransportCreationScreen.tsx` (Dispatch Wizard)**
    - Multi-step dispatch: workflow choice, source & destination pickers, container binding
    - Quick scan barcode simulator, AMR assignment preview, confirmation CTA
  - [x] **3.3 Specialized Transport Sub-Screens**
    - `TransportHistoryScreen.tsx`: timeline of past orders, retry action, filter pills
    - `PointToPointScreen.tsx`: direct transport stations, source/target selectors
    - `ReplenishmentScreen.tsx`: urgent stock call, rack level/bin picker, urgency level
  - [x] **3.4 Safety & Hazard Screens**
    - `PayloadRecoveryScreen.tsx`: stalled AMR selector, cargo salvage status, rescue action
    - `FleetRecallScreen.tsx`: maintenance bay routing, recall priority
    - `BlockPathHazardScreen.tsx`: aisle blockage alert, obstacle tag, Nav2 reroute simulation

- [x] **Phase 4: Monitoring, Inventory & Utility HUDs Audit & Upgrade**
  - [x] `JobMonitoringScreen.tsx`: AMR Telemetry HUD (speed, battery, heading, distance, lidar sensor state)
  - [x] `JobLiveMapScreen.tsx`: full-screen map with Nav2 waypoints and ETA countdown
  - [x] `InventoryLookupScreen.tsx` & `CreateContainerScreen.tsx`: SKU lookup, rapid container generator
  - [x] `OfflineBannerHUD.tsx`: connection loss banner and retry ping

- [x] **Phase 5: Global Modals & Popups Ratio / Scaling Audit**
  - [x] Check modal overlay opacity, centered vs bottom sheet modes, max-width constraints on web & tablets
  - [x] Verify typography hierarchy: bold 900 vs medium 500, uppercase mono tracking `0.14em`, subtext colors
  - [x] Verify haptic triggers and button tactile depression states (`transform: [{ scale: 0.98 }]`)

- [x] **Phase 6: Quality Verification, Commit & Deliverable Report**
  - [x] Full `tsc --noEmit` typecheck validation
  - [x] Full `npx expo export --platform web` build verification
  - [x] Stage, commit with Conventional Commits, push to `feature/app-extended-screens`
  - [x] Prepare comprehensive morning briefing report detailing changes and decisions
