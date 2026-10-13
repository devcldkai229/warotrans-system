# WaroTrans Mobile Staff App — Agent Guidelines & Design Standards

This is the **WaroTrans Mobile Staff App** (`warotrans-system/app`), a mission-critical warehouse execution handheld application connecting warehouse operators, Autonomous Mobile Robots (AMRs), and Warehouse Execution Systems (WES).

---

## 1. Source of Truth & Design Philosophy

- **Prototype Source of Truth**: `/mnt/Data/Capstone Project - WaroTrans/ui-design-prototype/prototype-staff-web/src/routes/index.tsx`
- **Master Design System Document**: See [`docs/DESIGN_SYSTEM_AND_RULES.md`](./docs/DESIGN_SYSTEM_AND_RULES.md) for full token details, layout proportions, and component specifications.
- **Aesthetic Standard**: Industrial Silicon Valley / Apple-grade UX. High contrast, tactile 3D button mechanics, crisp typography, and fluid micro-interactions.

---

## 2. Mandatory Design & Ergonomic Rules

### 2.1 Palette & Contrast (Never use faded gray)
- **Background**: `#f8fafc` (Slate-50).
- **Surface**: `#ffffff` (Card, Sheet, Modal).
- **Borders**: `#cbd5e1` (Slate-300 — high-contrast boundary, never faint borders).
- **Text Primary**: `#071523` (Slate-950 — bold, high legibility).
- **Text Secondary**: `#475569` (Slate-600 — crisp subtext, never `#94a3b8` for readable content).
- **Primary Accent**: `#005cd1` (WaroTrans Cobalt Blue) with 3D bottom border `#004bb0`.
- **Status Tones** (from `src/shared/theme/colors.ts`): Success `#007a38`, Warning `#f0b21b`, Danger `#c8272b`.
  Each also has `*Bg`, `*Soft` and `*Border` companions. Read the real token from `colors.ts` before using one.

### 2.2 Typography Hierarchy
- **Protocol Codes, IDs, Telemetry**: Monospace (`typography.fontMono`), font size 9-10pt, `fontWeight: '900'`, uppercase, tracking `0.12-0.16em`.
- **Card Headings & Titles**: `fontSans`, font size 13-16pt, `fontWeight: '900'`. Important info must be bold.
- **Labels & Subtext**: `fontSans`, font size 10-12pt, `fontWeight: '600' - '700'`, `#475569`.

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
- **Dropdown neo theo chiều cao header thật** — `AppHeader` đo bằng `onLayout` và truyền `anchorStyle = { top: headerHeight }`. Đừng hardcode `top: 92`: header cao cỡ 99–105pt tùy thiết bị, nên 92 sẽ chồm vào trong header.
  - **Migration đang dở** — các file sau vẫn còn `paddingTop: Platform.select(...)` và **phải** chuyển sang `useTopInset()`:
    `SubScreenHeader.tsx`, `JobsScreen.tsx`, `JobDetailScreen.tsx`, `TransportScreen.tsx`,
    `IssueReportingModal.tsx`, `InventoryLookupScreen.tsx`, `OfflineBannerHUD.tsx`, `BarcodeScannerHUD.tsx`.
    Đừng copy pattern cũ từ các file này.
- **Bottom Tab Bar (`src/app/navigation/BottomTabBar.tsx`)**:
  - The dock is a **floating pill**, not an edge-to-edge bar. This is deliberate: it keeps the
    tablet's thumb free to reach the bottom of the screen one-handed on a PDA. The full spec
    lives in [`docs/DESIGN_SYSTEM_AND_RULES.md`](./docs/DESIGN_SYSTEM_AND_RULES.md) §3.1.
  - It is `position: 'absolute'` and therefore carries **no automatic safe-area handling**:
    ```tsx
    bottom: dockMetrics.bottomOffset, // iOS 24, Android 16
    ```
  - **Never hardcode a bottom `paddingBottom` to clear the dock.** Use the measured inset:
    ```tsx
    const { dockHeight } = useNavigation();
    const dockInset = dockReservedSpace(dockHeight); // height + bottomOffset + gutter
    ```
    `dockHeight` is measured via `onLayout` on `dockPill` and published through
    `NavigationContext`. Three hand-tuned constants previously summed to ~2pt of slack, which
    broke whenever font metrics shifted.
  - Tab job count badge sits at `top: -8, right: -13`, fill `colors.warning` with
    `colors.textPrimary` text and a `colors.warningText` ring, so the counter reads as a
    separate chip instead of overlapping the icon glyph.
  - **Touch target floor is 44pt** (iOS HIG / Material) for every interactive element on the
    main tabs. `tabBtn` uses `paddingVertical: 11` around a 23pt icon = 45pt.
- **Sonner Toast Banner**:
  - Position below the iOS notch: `top: Platform.OS === 'ios' ? 54 : 14`.
  - Support custom icons (e.g. `MapPin` for "Locate Me"). Tap to dismiss, no close `X` button.
- **Thumb Zone & Bottom Sheet Docking**:
  - The `NEXT HANDOVER TASK` card must dock flush above the Floating Dock without empty voids,
    using the `dockInset` value above — never a fixed padding.
  - `ScrollView` must stay **scrollable in both sheet states**. Locking scroll while collapsed
    clips the sheet handle on short devices (iPhone SE at 667pt, and 640dp warehouse PDAs),
    making the fleet view impossible to expand.
  - Implement `PanResponder` vertical swipe gestures: swipe UP (`dy < -25`) expands fleet view; swipe DOWN (`dy > 25`) collapses it.

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
