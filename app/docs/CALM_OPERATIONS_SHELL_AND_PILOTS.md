# Calm Operations — Shell And Operational Screens

Updated 2026-10-17. All changes are within `app/`; backend and Web Admin are read-only references. The operational behavior in [MOBILE_BACKEND_REALIGNMENT.md](./MOBILE_BACKEND_REALIGNMENT.md) supersedes the former prototype and demo behavior.

The app uses the [foundation primitives](./CALM_OPERATIONS_FOUNDATION.md) and the current [design rules](./DESIGN_SYSTEM_AND_RULES.md). Operational screens import `Text`, `Button`, `Card`, `StatusPill`, `TextField`, `ChoiceField`, `ErrorBanner`, and `ActionModal` from `src/shared/ui`.

## Shell

`AppHeader`, `AccountSheet`, `ZonePickerModal`, `NotificationSheet`, `SafetyActionSheet`, and `OperationalScreen` live in `src/app/shell`. Shared UI stays independent of the navigation layer.

The root remains a plain View inside SafeAreaProvider. Headers read `useTopInset()`. OperationalScreen renders an inset-aware ScreenHeader, scrollable content, loading/error state and measured `dockReservedSpace(dockHeight)` clearance. ActionModal constrains width/height, scrolls its content and accommodates the keyboard.

AppHeader retains BrandMark, zone preference, notification bell and operator avatar. The zone is explicitly a local display preference. AccountSheet shows verified identity and that preference, with no invented shift schedule. Notification count starts at zero and follows actual received events. Logout clears session, route history and the job badge.

BottomTabBar remains flat and edge to edge with Home, Jobs and Transport. Its badge begins empty and is updated from actual job snapshots. It does not imply staff assignment, which the current job API does not expose.

## Jobs

JobsScreen loads real job summaries and presents active/history filters and search. Empty server responses replace the list with an empty state; errors remain visible. JobCard shows server progress and container counts.

RobotStartControl lists actual available, online, enabled robots on the job's map. CREATED and QUEUED jobs expose Start Job on Robot. Successful start replaces detail with the returned DTO or reloads the summary list.

JobDetailScreen resolves `currentStepId`, falling back only to active graph steps when no ID is supplied. A RUNNING job's current WAITING HUMAN_INTERACTION PICKUP_CONFIRM or DROPOFF_CONFIRM step exposes Handover Confirmation.

VerifyModal resolves the entered barcode through the server, compares the returned UUID with the expected container UUID, and confirms the step using `{ containerId, note }`. Server validation/conflict errors remain inside the modal. Only the returned JobDetailDto changes execution state. A mutation response supersedes older pending GET requests.

AmrCargoBayVisualizer lists every job container and resolves product/barcode metadata from real container details. There is no two-bay limit or fabricated quantity. JobStepper renders CHECK, MOVE, HUMAN_INTERACTION and WAIT, keyed by step UUID.

## Transport And Inventory

TransportScreen and TransportHistoryScreen show actual request lists and associated jobs queried by transportRequestId. Submitted requests can be queued; CREATED/QUEUED jobs can be started. Run Again retrieves request details and opens a new editable request. It does not copy a previous execution result.

TransportCreationScreen loads active warehouses/maps, eligible containers, real storage locations and published workflows. Workflow input fields are generated from STAFF_INPUT schema and coerced by wire type. Source endpoint/location/level comes from current container data; a missing source endpoint requires explicit choice. Destinations use real enabled endpoints and optional storage location/level. No slot availability is inferred.

Create, Queue and Start have distinct outcomes. Receipts are preserved on partial failure. Submit & Run starts one queued job on the selected robot; remaining jobs stay visible for deliberate start when a robot is available.

InventoryLookupScreen shows only real container, product and location fields. Relocation passes both container UUID and barcode. CreateContainerScreen implements product resolution, inventory context review and receiving, with an explicit unmapped-route banner for unavailable receiving endpoints.

## Facility Map And Safety

Home and Live Map use the same MiniFacilityMap renderer. It plots the real map image, GeoJSON zones/edges, endpoints and robot poses through the ROS transform including origin yaw. Marker positions require reported telemetry on the displayed map. Missing images retain geometry and show an image-unavailable notice. Connection and last-telemetry labels expose stale data.

Cancel Active Navigation Command targets only a reported currentCommandId. A successful HTTP 202 is displayed as Cancel Requested (Awaiting Robot ACK). It is not an emergency stop or return-to-base command.

Hazard reporting, issue submission, cargo transfer, nearby robot hold and offline mutation sync remain visibly unavailable. SafetyHoldContext and local success simulations are removed. BarcodeScannerHUD accepts actual scanner/manual input and explains that camera capture is not connected.

## Verification

- `npm run typecheck` — zero errors.
- `npm run test:realignment` — operational regression suite.
- `npx expo export --platform web` — web bundle verification.
- Expo dev server starts and serves HTTP 200 on local port 8088.
- No connected browser or reachable running backend was available for end-to-end validation. Expo's optional native DevTools launcher failed in this environment; Metro itself started successfully.


Transport movement derivation is covered independently: actual container location takes precedence over manual source input; absent sources require explicit endpoints; destination storage must match its endpoint; required dotted schema paths are validated.
