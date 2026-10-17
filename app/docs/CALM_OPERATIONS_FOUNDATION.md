# Calm Operations — Phase 1 Foundation (Design Tokens, Contracts, UI Primitives)

> Updated operational reference: [Mobile Backend Realignment](./MOBILE_BACKEND_REALIGNMENT.md). Runtime screens now use server DTOs; prototype job/robot/slot view models are removed. Use current tokens and rules from [DESIGN_SYSTEM_AND_RULES.md](./DESIGN_SYSTEM_AND_RULES.md). The original foundation history below is retained for context.


> **Scope**: `warotrans-system/app` only. FE-only change; no backend, database or
> API-schema edits.
> **Status**: Phase 1 of the redesign (complete). Tokens + primitives landed first;
> existing screens migrate in later phases. **Phase 2** retuned the palette and
> rebuilt the shell — see [`CALM_OPERATIONS_SHELL_AND_PILOTS.md`](./CALM_OPERATIONS_SHELL_AND_PILOTS.md).
> **Source of truth for contracts**: `warotrans-system/backend/src/Modules/**`.

Phase 1 changes three things and nothing else:

1. `src/shared/types/contracts.ts` mirrors the verified backend domain.
2. `src/shared/theme/*` carries the "Calm Operations" palette, type scale and elevation.
3. `src/shared/ui/*` is a new primitive library that new screens import from the barrel.

**No screen was rewritten, and no screen was deleted.** Every existing screen still
compiles and still renders; `npm run typecheck` is at zero errors.

---

## 1. Aesthetic contract

Apple / Linear "clean minimal" applied to a warehouse handheld:

| Rule | What it means in code |
| :--- | :--- |
| Flat, not chunky | 1px hairline borders + one shadow step. **No 3D bevels, no `borderBottomWidth` keys.** |
| Colour means something | Tone answers "does this need me?", never "what is this?". See §5. |
| Never tiny | The type scale bottoms out at **12pt**. Body copy is 14pt. |
| Touch floor | 44pt for every control, **48pt for a primary CTA (`size="md"`)**, 52pt at `lg`. |
| Press feedback | `transform: [{ scale: 0.98 }]` plus a slight opacity dip — no colour swap. |
| Depth from one inset source | Headers read `useTopInset()`; never a hardcoded `48`. |

---

## 2. Tokens

### 2.1 Colours — `src/shared/theme/colors.ts`

> **Superseded in part by Phase 2** — the palette moved onto the Google
> Workspace family. The table below is the Phase 1 record; the shipped values
> are in [`CALM_OPERATIONS_SHELL_AND_PILOTS.md`](./CALM_OPERATIONS_SHELL_AND_PILOTS.md) §1.

| Group | Tokens |
| :--- | :--- |
| Surfaces | `background #f8fafc`, `surface #ffffff`, `surfaceSubtle #f1f5f9`, `surfaceMuted #e2e8f0` |
| Borders | `border #e2e8f0`, `borderStrong #cbd5e1` |
| Text | `textPrimary #0f172a`, `textSecondary #475569`, `textMuted #64748b`, `textInverse #ffffff` |
| Brand | `primary #0062ff`, `primaryDark #0052d9`, `primaryLight #edf5ff`, `primaryBorder #b8d5ff`, `primaryText #004bb0` |
| Success | `success #059669`, `successBg #ecfdf5`, `successBorder #a7f3d0`, `successText #047857` |
| Warning | `warning #d97706`, `warningBg #fffbeb`, `warningBorder #fde68a`, `warningText #92400e` |
| Danger | `danger #dc2626`, `dangerBg #fef2f2`, `dangerBorder #fecaca`, `dangerText #b91c1c` |
| Info | `info #0284c7`, `infoBg #f0f9ff`, `infoBorder #bae6fd`, `infoText #0369a1` |

**Why each tone has a `*Text` companion.** Chip/label text sits on the `*Bg`
tint, not on white. `colors.success` on `colors.successBg` is 3.6:1 — fine for a
graphic, under the 4.5:1 that small text needs. The `*Text` tokens are the
one-step-darker shades (emerald-700, amber-800, red-700, sky-800) and clear 5:1
on their own tint. Use `*` for dots, bars and fills; use `*Text` for anything a
human has to read.

**Legacy aliases** (`borderSubtle`, `borderDark`, `successSoft`, `warningSoft`,
`dangerSoft`, `overlay`) are still exported because un-migrated screens read
them. Each is marked in the file; delete it when its last caller moves.
`border` was previously `#cbd5e1` — screens that need the heavier hairline now
use `borderStrong`. The `map*` blueprint tones are **not** legacy: Phase 2
retuned them off cyan and the new facility-map preview depends on them.

### 2.2 Typography — `src/shared/theme/typography.ts`

`fontSans` (Inter on web / SF on iOS / Roboto on Android) and `fontMono`
(JetBrains Mono / Menlo / monospace) plus an eight-step scale:

| Variant | Size / Line | Weight | Use |
| :--- | :--- | :--- | :--- |
| `display` | 24 / 30 | 700 | One per screen |
| `title` | 20 / 26 | 600 | Section or modal title |
| `headline` | 16 / 22 | 600 | Card heading, header title |
| `body` | 14 / 20 | 400 | Default copy |
| `bodyMedium` | 14 / 20 | 500 | Copy the operator must not skim |
| `label` | 13 / 18 | 500 | Field labels, control labels |
| `caption` | 12 / 16 | 400 | Timestamps, hints, metadata |
| `code` | 12 / 16 | 500 | Barcodes, endpoint codes, telemetry |

### 2.3 Elevation & radius — `src/shared/theme/shadows.ts`, `src/shared/theme/radii.ts`

`shadows.sm` (1px), `shadows.md` (card, default), `shadows.lg` (sheet/modal).
Three steps only — a fourth is a design problem, not a token.
`radii`: `sm 8`, `control 10`, `md 12`, `lg 16`, `pill 999`.

---

## 3. Primitives — `src/shared/ui/`

Always import from the barrel:

```tsx
import {
  Button, Card, Text, StatusPill, SegmentedControl, TextField, ScreenHeader, EmptyState, ProgressMeter,
} from '../../shared/ui';
```

### `Text`
`<Text variant="headline" color="textSecondary" numberOfLines={1} mono />`
Defaults to `body` / `textPrimary`. `label` and `caption` default to `textSecondary`.
`mono` defaults to on for `variant="code"`. `color` accepts a **token name**
(`"textMuted"`, resolved against `colors`) or any raw string. There is no
`uppercase` prop — new UI is Title Case, never ALL-CAPS.

### `Button`
```tsx
<Button title="Start Handover" onPress={go} size="lg" icon={Play} fullWidth />
```
`variant`: `primary | secondary | outline | ghost | danger` · `size`: `sm` (44pt) · `md` (48pt) · `lg` (52pt).
`loading` keeps the label and swaps the icon for a spinner so the button never
changes width mid-tap.

### `Card`
```tsx
<Card padding="md" gap={12} onPress={open}>…</Card>
```
`padding`: `none | sm | md | lg`. `gap` and `contentStyle` apply to the **inner
content wrapper** — `style` lands on the outer card, which has a single child box
and therefore nothing to space out. `onPress` turns it into a `Pressable` with a
2% opacity dip on press.

### `StatusPill`
```tsx
<StatusPill status={robot.status} dot />
<StatusPill status="RECOVERY_REQUIRED" size="sm" tone="danger" label="Needs operator" />
```
Tone is **derived from the status value** (see §5); `tone` and `label` are
optional overrides. `RECOVERY_REQUIRED` renders as "Recovery Required".

### `SegmentedControl`
```tsx
<SegmentedControl
  options={[
    { label: 'My Jobs', value: 'mine' },
    { label: 'Global Pool', value: 'global' },
  ]}
  value={view}
  onChange={setView}
/>
```
Controlled — a parent can veto a switch by not calling `onChange`. Every segment
is `flex: 1` and at least 44pt tall (the touch floor); the active one is a white
card lifted by `shadows.sm`.

### `TextField`
```tsx
<TextField label="Endpoint" value={code} onChangeText={setCode}
  leftIcon={<Search size={18} color={colors.textMuted} />}
  showClearButton error={error} hint="Scan the barcode at the dock" />
```
48pt tall, hairline border that turns accent on focus and danger on error.
`error` wins over `hint`. `onFocus`/`onBlur` from the caller are preserved.
`showClearButton` defaults its handler to `onChangeText('')` and is suppressed
while `editable` is false.

### `ScreenHeader`
```tsx
<ScreenHeader title="Job Detail" subtitle="JOB-2026-0114" canGoBack onBack={goBack}
  rightAction={<StatusPill status={job.status} size="sm" />} />
```
Top padding comes from `useTopInset()` — the real device inset on native, the
simulated status bar inside the web phone frame. `transparent` drops the fill and
hairline for headers over a map or sheet.

### `EmptyState`
```tsx
<EmptyState icon={Inbox} title="No jobs yet"
  message="Requests assigned to your zone appear here."
  actionTitle="Create transport request" onAction={create} />
```

### `ProgressMeter` *(added in Phase 2)*
```tsx
<ProgressMeter value={job.progressPercent ?? 0} tone="warning"
  accessibilityLabel={`${job.id} progress`} />
```
4pt bar by default. `tone` is `'primary'` or any `SemanticTone`. The value is
clamped to 0-100, and the fill is a plain `View` with a percentage width — at
4pt an animated driver costs a frame budget and buys nothing.

---

## 4. Contracts — `src/shared/types/contracts.ts`

Mirrors the C# 1:1 (camelCase fields, string enums, `Guid`/`DateTimeOffset` →
`string`). Sections: Identity, Warehouse, Navigation, Fleet, WorkflowExecution,
Transportation. Each block cites the backend file it came from.

Notable additions versus the Phase 0 file:

- `AccountRole` is `'ADMIN' | 'STAFF'` — **`MAINTAINER` was removed**, matching
  `Identity/Enums/AccountRole.cs`. Nothing in the app referenced it.
- Full DTOs: `AccountResponse`, `SessionResponse`, `WarehouseListItemResponse`,
  `EndpointResponse`, `ZoneResponse`, `MapVersionResponse`, `WorkflowListItemDto`,
  `WorkflowDetailDto`, `WorkflowRequestInputSchemaDto`,
  `CreateTransportRequestRequest`, `CreateTransportRequestResponse`,
  `QueueTransportRequestResponse`, `RobotResponse`.
- Supporting value types: `StepFailurePolicy`, `WorkflowVariableDefinition`,
  `StepInputBinding`, `WorkflowTaskDto`, `WorkflowStepDto`, `RequestInputFieldDto`,
  `QueuedJobResponse`, `TransportRequestDetailResponse`, `JsonValue`, `UtcDateTime`.

**Backward compatibility.** The Phase 0 view models (`UserSession`, `RobotSummary`,
`JobSummary`, `JobStepSummary`, `ContainerSlot`, `WorkflowTemplate`, `WorkflowCode`)
stay in the same file, in a clearly marked block at the bottom. They are the
prototype projections the current screens render from; they are removed as each
screen is rewritten against the DTOs above.

---

## 5. Status → tone (the one status table)

`StatusPill` derives its tone from the status string through one flat map, because
`PAUSED` exists on Robot, Job, Task and Step and must always look the same.

| Tone | Statuses |
| :--- | :--- |
| `neutral` | CREATED, PENDING, IDLE, UNKNOWN, QUEUED, SUBMITTED, DRAFT, OFFLINE, EMPTY, ARCHIVED, SKIPPED |
| `info` | EXECUTING, RUNNING, IN_PROGRESS, IN_TRANSIT, EN_ROUTE, ASSIGNED, ONBOARD, NAVIGATING, MAINTENANCE |
| `success` | ACTIVE, AVAILABLE, STANDBY, READY, COMPLETED, SUCCEEDED, DELIVERED, STORED, PACKED, LOCALIZED, PUBLISHED |
| `warning` | PAUSED, WAITING, WAITING_HANDOVER, AWAITING_HANDOVER, HOLD, CHARGING, RESERVED, REASSIGNING, PARTIALLY_COMPLETED |
| `danger` | ERROR, FAILED, LOST, CANCELLED/CANCELED, REJECTED, OUT_OF_SERVICE, RECOVERY_REQUIRED |

Anything unrecognised falls back to `neutral`, so a new backend enum member shows
up as a grey chip rather than crashing a screen. `statusTone()` and `statusLabel()`
are exported for screens that need the mapping without the component.

---

## 6. Migration rules for later phases

1. New screens use `src/shared/ui` only. `src/shared/components/*` (legacy
   `Button`, `Card`, `Badge`, `Input`, `SubScreenHeader`) is frozen — add nothing to it.
2. Never introduce a raw hex or a `fontSize` in a migrated screen. Tokens only.
3. A screen is "migrated" when it imports no `shared/components/*` and no inline
   `fontSize`. Delete the corresponding legacy token/alias in the same change.
4. Contract migration lands per screen: swap the view model for the DTO inside the
   screen, then delete the view model when its last importer is gone.