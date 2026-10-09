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
- **Status Tones**: Success `#059669`, Warning `#d97706`, Danger `#dc2626`.

### 2.2 Typography Hierarchy
- **Protocol Codes, IDs, Telemetry**: Monospace (`typography.fontMono`), font size 9-10pt, `fontWeight: '900'`, uppercase, tracking `0.12-0.16em`.
- **Card Headings & Titles**: `fontSans`, font size 13-16pt, `fontWeight: '900'`. Important info must be bold.
- **Labels & Subtext**: `fontSans`, font size 10-12pt, `fontWeight: '600' - '700'`, `#475569`.

### 2.3 Edge-to-Edge Layout & Mobile Safe Insets (iPhone 12 / Modern Smartphones)
- **NO root `<SafeAreaView>`**:
  - The root in `App.tsx` must be a plain `<View style={{ flex: 1, backgroundColor: colors.background }}>`. Wrapping the whole app in `SafeAreaView` causes letterbox gaps on physical iPhones.
- **Header Top Inset**:
  - All top headers (`AppHeader`, `SubScreenHeader`, `JobsScreen`, `TransportScreen`, `JobDetailScreen`, `LoginScreen`) MUST have:
    ```tsx
    paddingTop: Platform.OS === 'ios' ? 48 : 12,
    minHeight: Platform.OS === 'ios' ? 104 : 72,
    ```
  - Dropdown menus must open below the header: `top: Platform.OS === 'ios' ? 92 : 56`.
- **Bottom Tab Bar**:
  - Must extend edge-to-edge to the physical bottom:
    ```tsx
    height: Platform.OS === 'ios' ? 86 : 72,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    ```
  - Tab job count badge sits at `top: -2, right: 0` (never overlap the icon).
- **Sonner Toast Banner**:
  - Position below the iOS notch: `top: Platform.OS === 'ios' ? 54 : 14`.
  - Support custom icons (e.g. `MapPin` for "Locate Me"). Tap to dismiss, no close `X` button.
- **Thumb Zone & Bottom Sheet Docking**:
  - The `NEXT HANDOVER TASK` card must dock flush above the Bottom Tab Bar without empty voids.
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
