# WaroTrans Mobile Staff App — Agent Guidelines & Design Standards

This is the **WaroTrans Mobile Staff App** (`warotrans-system/app`), a mission-critical warehouse execution handheld application connecting warehouse operators, Autonomous Mobile Robots (AMRs), and Warehouse Execution Systems (WES).

---

## 0. Current Design Language — "Calm Operations"

The app follows **"Calm Operations"** (Apple / Linear / Google Workspace clean minimal).
Phase 1 landed the foundation (tokens, contracts, the `src/shared/ui` primitive
library). The shell and operational screens now follow the backend realignment described in
[`docs/MOBILE_BACKEND_REALIGNMENT.md`](./docs/MOBILE_BACKEND_REALIGNMENT.md).

- **Foundation doc**: [`docs/CALM_OPERATIONS_FOUNDATION.md`](./docs/CALM_OPERATIONS_FOUNDATION.md).
- **Shell + pilot doc**: [`docs/CALM_OPERATIONS_SHELL_AND_PILOTS.md`](./docs/CALM_OPERATIONS_SHELL_AND_PILOTS.md).
- The shell lives in **`src/app/shell/`** (`AppHeader`, `SafetyActionSheet`), not `src/shared/components/*`:
  it navigates, so it sits above the feature layer and may import `NavigationContext`. `src/shared/**`
  stays a leaf layer that never imports from `src/app/**`.
- **New screens and migrated screens import primitives from the barrel**, never from `shared/components/*`:
  ```tsx
  import { Button, Card, Text, StatusPill, SegmentedControl, TextField, ProgressMeter, EmptyState } from '../../shared/ui';
  ```
- **Overriding rules for anything that uses `src/shared/ui`:**
  - `Text` is the only text element. No inline `fontSize`; the scale bottoms out at **12pt** (never below 11pt anywhere).
  - Flat surfaces: 1px hairline + one of `shadows.sm | md | lg`. **No 3D bevels** (`borderBottomWidth` keys) in new UI.
  - Touch floor is 44pt (`sm`), 48pt (`md`, every primary action) and 52pt (`lg`).
  - Status colour is derived, never hand-picked: pass the status to `StatusPill` (`RECOVERY_REQUIRED` -> danger).
  - **Copy is Title Case.** Never `textTransform: 'uppercase'` in new UI — it reads as shouting on a screen an operator glances at while walking.
  - Header insets still come from `useTopInset()` — see §2.3, which is unchanged.
- **Contracts**: `src/shared/types/contracts.ts` mirrors the C# backend 1:1 (camelCase, string enums). Job summaries and runtime detail graphs mirror the PR #41 read models. Only `UserSession` remains as a local projection of a verified server account; its zone is a device display preference.
- The legacy rules in §2 below still govern **un-migrated** screens. When the two conflict for a migrated screen, this section wins.

---

## 1. Source of Truth & Design Philosophy

- **Prototype Source of Truth**: `/mnt/Data/Capstone Project - WaroTrans/ui-design-prototype/prototype-staff-web/src/routes/index.tsx`
- **Master Design System Document**: See [`docs/DESIGN_SYSTEM_AND_RULES.md`](./docs/DESIGN_SYSTEM_AND_RULES.md) for full token details, layout proportions, and component specifications.
- **Aesthetic Standard**: Industrial Silicon Valley / Apple-grade UX. High contrast, tactile 3D button mechanics, crisp typography, and fluid micro-interactions.

---

## 2. Mandatory Design & Ergonomic Rules

### 2.1 Palette & Contrast (Never use faded gray)
- **Background**: `#eef1f6` (`colors.background`).
- **Surface**: `#ffffff` (`colors.surface`) — Card, Sheet, Modal, Header.
- **Inset**: `#f4f6fa` (`colors.surfaceSubtle`) — route rows and detail blocks inside a card.
- **Borders**: `rgba(33, 34, 38, 0.08)` (`colors.border`), heavier `colors.borderStrong` `#c4c8d0`.
- **Text Primary**: `#121317` (`colors.textPrimary`).
- **Text Secondary**: `#45474d` (`colors.textSecondary`) — never `#6a6a71` (`textMuted`) for readable content.
- **Primary Accent**: `#1557d0` (`colors.primary`, and `colors.primaryText` for accent text); white on that fill is 6.35:1. Pressed/darker tone is `primaryDark` (`#0f3f9e`); `danger`/`warning` text comes from the `*Text` companions.
- **Status Tones** (from `src/shared/theme/colors.ts`): Success `#059669`, Warning `#d97706`, Danger `#dc2626`, Info `#0284c7`.
  Each also has `*Bg`, `*Border` and `*Text` companions. Read the real token from `colors.ts` before using one.

### 2.2 Typography Hierarchy
Type scale lives in `src/shared/theme/typography.ts` and bottoms out at **12pt**: Display 24 · Title 20 · Headline 16 · Body 14 · Label 13 · Caption 12 · Code 12 (mono).
- **Protocol Codes, IDs, Telemetry**: `variant="code"` (JetBrains Mono / Menlo, 12pt, weight 500-700). No ALL-CAPS transform — the uppercase was the Phase 0 look and it is gone from new UI.
- **Card Headings & Titles**: `variant="headline"` (16pt, weight 600). Important info must not be skimmed past.
- **Labels & Subtext**: `variant="label"` (13pt) and `variant="caption"` (12pt), `colors.textSecondary`.

### 2.3 Edge-to-Edge Layout & Mobile Safe Insets (iPhone 12 / Modern Smartphones)
- **NO root `<SafeAreaView>`**:
  - The root in `App.tsx` must be a plain `<View style={{ flex: 1, backgroundColor: colors.background }}>`. Wrapping the whole app in `SafeAreaView` causes letterbox gaps on physical iPhones.
- **Header Top Inset — dùng `useTopInset()`, KHÔNG hardcode số**:
  ```tsx
  import { useTopInset } from '../theme/layout';
  const topInset = useTopInset();
  <View style={[styles.header, { paddingTop: topInset }]} />
  ```
  `useTopInset()` (`src/shared/theme/layout.ts`) trả về:
  - **web** → `SIMULATED_STATUS_BAR (44) + 4 = 48`, chừa chỗ cho status bar giả mà `App.tsx` vẽ trong khung điện thoại (mô phỏng tai thỏ / nối ruồi).
  - **native** → `insets.top` thật của thiết bị, dao động **20pt (SE) → 47pt (iPhone 12/13) → 59pt (Dynamic Island 14/15/16 Pro)**.

  Trước đây cả hai trường hợp dùng chung một hằng số `48`, chỉ đúng ở iPhone 12/13. **Đừng viết lại `Platform.OS === 'ios' ? 48 : 12`** — đó chính là lỗi lệch inset mà `useTopInset` sinh ra để tránh.
- **SafeAreaProvider**: root trong `App.tsx` đã bọc `<SafeAreaProvider>` (bắt buộc cho `useSafeAreaInsets`), nhưng root vẫn là plain `<View>` — **không** dùng `SafeAreaView`.
- **Bottom Tab Bar (`src/app/navigation/BottomTabBar.tsx`)**:
  - The bar is **flat and edge to edge**: white surface, a single 1px top hairline, no floating pill,
    no floating shadow. **3 core tabs** — `Home`, `Jobs`, `Transport` — minimalist icon-only for
    maximum touch focus and elegance (touch targets >= 72pt width x 44pt height).
  - Active tab: soft rounded-full pill highlight (`rgba(21, 87, 208, 0.08)`) with `colors.primaryText` (`#1a5cd6`) icon. Inactive: `colors.textMuted`.
  - Tab job count badge sits at `top: -6, right: -13`, filled with **bright warm Amber-400 (`#fbbf24`)**,
    a crisp **1.5px white border (`#ffffff`)**, and high-contrast **deep amber text (`#78350f`)** (WCAG AAA >= 7:1),
    ensuring it is light, friendly, and never muddy or burnt-dark.
  - It is `position: 'absolute'` (content scrolls underneath it, the Google-console pattern) and
    carries a safe-area sibling strip:
    ```tsx
    const insets = useSafeAreaInsets();
    const bottomInset = insets.bottom || 10;
    <View style={[styles.safeArea, { height: bottomInset }]} pointerEvents="none" />
    ```
  - **Never hardcode a bottom `paddingBottom` to clear the bar.** Use the measured height:
    ```tsx
    const { dockHeight } = useNavigation();
    const bottomInset = dockReservedSpace(dockHeight); // height + bottomOffset(0) + gutter(16)
    ```
- **App Header (`src/app/shell/AppHeader.tsx`)**:
  - Content row is **56px** (`minHeight: 56`, `paddingTop: topInset + 4`, `paddingBottom: 10`) for a solid,
    executive feel with ample vertical breathing room.
  - **Left**: Monochrome `BrandMark` (40px) paired directly with Work Zone selector pill (`📍 Inbound Dock 01 ▾`, 40px height, rounded full) with NO redundant "WaroTrans" text, providing maximum horizontal breathing room.
  - **Right**: Notification Bell (`Bell`, 40px with the actual unread event count and compact anchored dropdown `NotificationSheet` 320px width in 100% English) + Operator Avatar (`Avatar`, 40px, solid black `#121317`). Search button removed to eliminate header clutter (inventory/lookup accessible via Transport Hub).
- **Live Map Screen (`src/features/monitoring/JobLiveMapScreen.tsx`)**:
  - Uses `ScreenHeader` through `OperationalScreen`, safe-area insets and measured dock clearance.
  - Renders full map geometry from `MapVersionDetailDto`; endpoints, edges, zones and reported robot poses use
    `worldToImagePixel` from `src/shared/map/mapCoordinateTransform.ts`.
  - Transform includes resolution, origin X/Y/yaw, image height inversion (`H - v`) and no half-cell shift.
  - Never hardcode robot count, coordinates, routes, velocity, ETA or rack names. Unreported telemetry is unavailable.
- **Sonner Toast Banner**:
  - Position below the iOS notch: `top: Platform.OS === 'ios' ? 54 : 14`.
  - Support custom icons (e.g. `MapPin` for "Locate Me"). Tap to dismiss, no close `X` button.
- **Header overlays & modals**:
  - `AppHeader` does not anchor dropdowns to a measured header height. The zone picker, the
    account sheet and the safety sheet are all `Modal`s — occasional actions do not earn a
    permanently mounted popover.
  - A screen that floats its own chrome over scrolling content (the Live Map telemetry sheet)
    must offset itself by `dockReservedSpace(dockHeight)`, not by a constant.

### 2.4 Haptic Vibration Policy (`src/shared/utils/haptics.ts`)
- **Zero Motor Spam**: Routine taps (`'tap'`), ticks (`'tick'`), tab switching, and opening standard dialogs MUST be silenced.
- **Micro-Pulse Intensity**:
  - `'success'`: Single 10ms micro-pulse (crisp Apple Watch-like feel).
  - `'warning'`: Single 15ms tap.
  - `'error'`: Double 20ms pulse `[0, 20, 30, 20]` (never harsh 80ms buzzes).

### 2.5 Hermes Native Crash Prevention
- **Web vs Native Isolation**: Never call browser globals (`window.location`, `window.history`, `document`) on native! Always guard with `if (Platform.OS === 'web' && typeof window !== 'undefined')`.
- **StyleSheet Constraints**: Never put `pointerEvents: 'none'` in `StyleSheet.create`. Use the JSX prop `<View pointerEvents="none">`.

---

## 3. Essential Commands & Verification

Always run validation before concluding any task:

```bash
# Typecheck (MANDATORY — must be 0 errors)
npm run typecheck

# Operational regression checks
npm run test:realignment

# Web bundle and Expo status
npx expo export --platform web
npx expo start
```

## 4. Scope, Boundaries & Documentation Maintenance Rule
- **Scope**: This realignment edits only `warotrans-system/app/`. Backend and Web Admin code are read-only references. Do not edit `backend/`, `web/` or other directories. Do NOT consult external specification/prototype directories for this task.
- **MANDATORY Documentation Updates**: After every code change, feature calibration, or design decision, the agent MUST immediately update the living `.md` documentation in `warotrans-system/app/docs/` (`CALM_OPERATIONS_SHELL_AND_PILOTS.md`, `DESIGN_SYSTEM_AND_RULES.md`, `progress.md`) and `AGENTS.md`. Never let documentation drift behind code changes.


## 5. Backend Truthfulness Rules (2026-10-17)

- Authenticate only after successful login or verified `/api/identity/me`. Failed refresh clears tokens/session and notifies auth listeners. All auth persistence uses the session generation and serialized storage queue.
- Preserve empty server envelopes and propagate HTTP/network `ApiError`. Never seed operational lists, fabricate IDs/receipts or simulate mutation success.
- `CREATED`/`QUEUED` jobs start with a real robot UUID. Only a `RUNNING` job's current `WAITING` `HUMAN_INTERACTION` `PICKUP_CONFIRM`/`DROPOFF_CONFIRM` step offers handover confirmation.
- Resolve barcode → container UUID, match expected `resolvedInputs.containerId`, then confirm the real step UUID with `{ containerId, note }`. Apply only the returned `JobDetailDto`.
- Transport uses published workflow schemas, typed `STAFF_INPUT`, actual container sources and real destination endpoint/location/level. No local occupancy or reservations. Retain Create → Queue → Start receipts on partial failure; start one job per available robot at a time.
- Receiving is Resolve Product → Inventory Context → Create Container. Explain unmapped 404/405 receiving routes; never create locally.
- Realtime starts empty. Derive local notifications from job/connectivity events, serialize connection lifecycle, retry initial failures and resync REST snapshots after reconnect. Reject prior-session callbacks and stale snapshots.
- Cancel only an active command. HTTP 202 means **Cancel Requested (Awaiting Robot ACK)**. Never label navigation cancellation as E-Stop or Recall.
- Hazard/issue reporting, payload recovery, nearby hold and offline sync have no server capability. Keep controls disabled and explain availability. No simulated scan results, pending counters or fake shift hours.
- Run `npm run typecheck`, `npm run test:realignment`, and an Expo web build; report live backend/browser limitations honestly.


Transport movement derivation is covered independently: actual container location takes precedence over manual source input; absent sources require explicit endpoints; destination storage must match its endpoint; required dotted schema paths are validated.
