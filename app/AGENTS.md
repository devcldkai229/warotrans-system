# WaroTrans Mobile Staff App — Agent Guidelines & Design Standards

This is the **WaroTrans Mobile Staff App** (`warotrans-system/app`), a mission-critical warehouse execution handheld application connecting warehouse operators, Autonomous Mobile Robots (AMRs), and Warehouse Execution Systems (WES).

---

## 0. Current Design Language — "Calm Operations"

The app follows **"Calm Operations"** (Apple / Linear / Google Workspace clean minimal).
Phase 1 landed the foundation (tokens, contracts, the `src/shared/ui` primitive
library). Phase 2 landed the **shell** (`AppHeader`, `BottomTabBar`,
`SafetyActionSheet`) and the **pilot screens** (`Home`, `Jobs`, `JobCard`).

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
- **Contracts**: `src/shared/types/contracts.ts` mirrors the C# backend 1:1 (camelCase, string enums). The Phase 0 view models (`UserSession`, `JobSummary`, `RobotSummary`, ...) remain for un-migrated screens and are deleted per-screen as DTOs land.
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
  - The bar is **flat and edge to edge**: white surface, a single 1px top hairline, no pill, no
    floating shadow. Four tabs — Home, Jobs, Live Map, Transport — with 12pt Title Case labels.
  - It is `position: 'absolute'` (content scrolls underneath it, the Google-console pattern) and
    therefore carries **no automatic safe-area handling**. The inset is a sibling strip, not a
    `paddingBottom`, so the white surface stays unbroken on a device with a home indicator:
    ```tsx
    const insets = useSafeAreaInsets();
    const bottomInset = insets.bottom || 8; // 8 is the web phone-frame fallback
    <View style={[styles.safeArea, { height: bottomInset }]} pointerEvents="none" />
    ```
  - **Never hardcode a bottom `paddingBottom` to clear the bar.** Use the measured height:
    ```tsx
    const { dockHeight } = useNavigation();
    const bottomInset = dockReservedSpace(dockHeight); // height + bottomOffset(0) + gutter(16)
    ```
    `dockHeight` is measured via `onLayout` on the bar and published through `NavigationContext`.
    Three hand-tuned constants previously summed to ~2pt of slack, which broke whenever font metrics shifted.
  - Active tab: `colors.primary` icon + label at weight 600. Inactive: `colors.textMuted` at 500.
  - Tab job count badge sits at `top: -6, right: -12`, fill `colors.warning` with
    `colors.textPrimary` text and a `colors.warningText` ring, so the counter reads as a
    separate chip instead of overlapping the icon glyph.
  - **Touch target floor is 44pt** (iOS HIG / Material) for every interactive element on the
    main tabs. Each tab is a 48pt-min row inside the 56pt bar.
- **Sonner Toast Banner**:
  - Position below the iOS notch: `top: Platform.OS === 'ios' ? 54 : 14`.
  - Support custom icons (e.g. `MapPin` for "Locate Me"). Tap to dismiss, no close `X` button.
- **Header overlays & modals**:
  - `AppHeader` no longer anchors dropdowns to a measured header height. The zone picker, the
    account sheet and the safety sheet are all `Modal`s — occasional actions do not earn a
    permanently mounted popover, and an anchored one drifted by up to 39pt between an SE and a
    Dynamic Island.
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

# Check Expo status
npx expo start
```

## 4. Scope & Boundary Rules
- **FE-Only**: Modify only files within `warotrans-system/app/`. Do not touch backend, database, or API schemas without explicit user consent.
- **Preserve Documentation**: Keep `app/docs/` up to date when introducing new patterns or major design tokens.
