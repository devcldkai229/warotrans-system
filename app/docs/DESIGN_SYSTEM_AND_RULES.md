# WaroTrans Mobile Staff App — Design And Operational Rules

Updated 2026-10-17. This is the current Calm Operations reference. Former Industrial prototype rules, simulated map coordinates and demo operational state are superseded. See [MOBILE_BACKEND_REALIGNMENT.md](./MOBILE_BACKEND_REALIGNMENT.md) for backend behavior and [CALM_OPERATIONS_SHELL_AND_PILOTS.md](./CALM_OPERATIONS_SHELL_AND_PILOTS.md) for screen structure.

## Design Tokens

Read the implementation in `src/shared/theme` before using a token. Do not duplicate colors or type sizes inside screens.

| Token | Current Value | Use |
| :--- | :--- | :--- |
| background | `#eef1f6` | Screen canvas |
| surface | `#ffffff` | Cards, sheets, headers |
| surfaceSubtle | `#f4f6fa` | Inset blocks |
| surfaceMuted | `#e5e9f0` | Quiet tracks |
| border | `rgba(33, 34, 38, 0.08)` | Hairlines |
| borderStrong | `#c4c8d0` | Stronger boundaries |
| textPrimary | `#121317` | Readable primary content |
| textSecondary | `#45474d` | Readable supporting content |
| primary / primaryDark | `#1557d0` / `#0f3f9e` | Accessible primary action fills |
| primaryText | `#1a5cd6` | Accent foreground |
| primaryLight / primaryBorder | `#e9f1ff` / `#b8d5ff` | Accent wells and borders |
| success / warning / danger / info | `#059669` / `#d97706` / `#dc2626` / `#0284c7` | Semantic graphics |

Status text uses StatusPill and its derived tone. Semantic foreground uses the companion `*Text` token. `textMuted` is reserved for placeholders or incidental notes.

## Typography And Controls

Import primitives from `src/shared/ui`. Text is the only text element for new/migrated UI; font sizes come from the shared scale: display 24, title 20, headline 16, body 14, label 13, caption/code 12. No font-size overrides below the scale floor. Codes and UUIDs use `variant="code"`; do not uppercase ordinary labels.

Surfaces are flat with a hairline, token radius and one shadow level. No bevels. Buttons use 44pt small, 48pt primary and 52pt large targets. ChoiceField provides a searchable expanded list for longer catalogs. ErrorBanner displays server messages within the action's screen or modal.

## Insets And Navigation

The app root remains a plain View within SafeAreaProvider. `useTopInset()` supplies real native or simulated web inset. No hardcoded native notch heights. Content clears the absolute BottomTabBar with measured `dockReservedSpace(dockHeight)`.

Navigation-aware shell components live in `src/app/shell`; shared UI never imports `src/app`. OperationalScreen composes screen header, scrolling, loading, retry and error state. Account/zone preferences are local device UI, never backend work assignments or shift schedules.

Guard browser globals with `Platform.OS === 'web'` and an availability check. Set pointerEvents as a JSX prop, never a StyleSheet entry.

## Truthful State And Actions

Only successful server responses establish authentication or operational outcomes. Empty lists stay empty. Network/HTTP failures show the real error. Unknown counts display Awaiting Server Data. Do not replace failures with seeds, fake IDs, receipts, container metadata, telemetry or notifications.

Server job summaries are distinct from detail graphs. Current step UUID and status control handover availability. Render every returned container and every step type. Use UUID keys. Do not infer task acceptance, staff ownership, bay capacity or progress from prototype constants.

Transport Create → Queue → Start is explicit. Preserve prior successful receipts during retries. Use published workflow input schema and actual current container sources. Endpoint/location/level selection does not imply slot availability or reservation.

Receiving uses product resolution and real inventory context. Unmapped server receiving routes show an honest capability error. No local container creation.

Realtime starts empty, derives notifications from actual events and resyncs REST state after reconnect. Preserve newer events during snapshot merging and discard prior-session callbacks. Display actual event/receipt time and last telemetry time; do not claim stale data is live.

## Map Coordinates

MiniFacilityMap renders server map assets and full endpoints/edges/zones. `worldToImagePixel` matches Web Admin's continuous ROS transform, including origin rotation and `imageHeightPixels - localY / resolution`. Do not introduce a half-cell shift, fixed warehouse layout or fixed robot count. Missing images/telemetry are explicitly unavailable.

## Safety Capability Boundaries

Navigation cancellation is a request against a real active command. HTTP 202 means Cancel Requested (Awaiting Robot ACK). It does not establish emergency stop, recall, task release or safe aisle access.

Operations hazard reporting, issue submission, payload transfer, nearby hold and offline mutation queuing are unavailable on the current server. Controls are disabled and explanatory. Never fabricate success toasts or pending synchronization counters. Camera capture is not implemented; barcode input must come from actual manual/scanner input.

Routine taps/ticks remain silent. Success uses a 10ms micro-pulse, warning 15ms, error `[0, 20, 30, 20]` as implemented in `haptics.ts`.

## Validation And Scope

All edits for this realignment stay within `app/`. Backend and Web Admin are read-only references. Update this document, shell documentation, progress and AGENTS.md with behavioral changes.

Run `npm run typecheck`, `npm run test:realignment`, an Expo web export and an Expo startup check. Report verification limits; a mocked regression suite is not a live robot or backend end-to-end test.


Transport movement derivation is covered independently: actual container location takes precedence over manual source input; absent sources require explicit endpoints; destination storage must match its endpoint; required dotted schema paths are validated.
