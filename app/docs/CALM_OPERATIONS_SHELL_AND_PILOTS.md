# Calm Operations — Phase 2: Shell Rebuild & Pilot Screens

> **Scope**: `warotrans-system/app` only. FE-only change; no backend, database or
> API-schema edits.
> **Status**: shipped, plus a review pass (contrast, lifecycle, zone filtering,
> simulation notice, shell modularity). `npm run typecheck` is at zero errors and
> the web bundle builds (`npx expo export --platform web`).
> **Builds on**: [CALM_OPERATIONS_FOUNDATION.md](./CALM_OPERATIONS_FOUNDATION.md) (Phase 1).

Phase 2 turns the Phase 1 foundation into a shipped shell and three screens that
use nothing but it. Nothing outside `src/shared/theme`, `src/shared/ui`,
`src/app/{navigation,shell}` and the three pilot screens was redesigned; the
remaining screens still render their own headers inside the new shell.

---

## 1. Palette — the Google Workspace shift

The Phase 1 palette was a *warm-neutral slate* system. Phase 2 moves it onto the
**Google Cloud Console** family: a cool grey canvas, near-black inks, and a
single blue accent that is allowed to be bright because nothing else is.

| Group | Phase 1 | Phase 2 (now) |
| :--- | :--- | :--- |
| Canvas | `#f8fafc` | **`#eef1f6`** |
| Surface | `#ffffff` | `#ffffff` |
| Inset | `#f1f5f9` | **`#f4f6fa`** |
| Muted track | `#e2e8f0` | **`#e5e9f0`** |
| Border | `#e2e8f0` | **`rgba(33, 34, 38, 0.08)`** |
| Border (strong) | `#cbd5e1` | `#c4c8d0` |
| Ink / secondary / muted | `#0f172a` `#475569` `#64748b` | **`#121317` `#45474d` `#6a6a71`** |
| Accent | `#0062ff` | **`#1557d0`** |
| Accent (dark / light / border / text) | `#0052d9` `#edf5ff` `#b8d5ff` `#004bb0` | `#0f3f9e` `#ebf2fe` `#b8d5ff` `#1557d0` |
| Success / Warning / Danger / Info | `#059669` `#d97706` `#dc2626` `#0284c7` | unchanged |

**Why `border` became translucent.** A fixed hairline hex has to be re-tuned for
every surface it lands on — white cards, the `#eef1f6` canvas, a tinted status
fill. `rgba(33, 34, 38, 0.08)` is one value that reads correctly on all three,
which is what removes a whole category of "why is this hairline invisible here".

**Blueprint map tokens were retuned off cyan.** `mapBackground` is now `#e9eefa`
(not `#e0f2fe`). A saturated cyan map inside a calm grey app reads as a different
application pasted into the frame; the grid and zone blocks carry the same
information at a fraction of the contrast cost.

**The accent was darkened after the review.** `#3279f9` is 3.53:1 against white —
it passes as a *graphic* (a meter fill, a selected chip's border) and fails as a
*surface with white text on it*, which is exactly what every `variant="primary"`
button is. `primary` is now `#1557d0` (6.35:1 on white), `primaryDark` dropped to
`#0f3f9e`, and `primaryText` stays `#1557d0`: one accent value that is legible as
a fill *and* as foreground. The bottom tab bar's active icon and label read
`primaryText` for the same reason — 12pt text on a white bar is the foreground
case, not the fill case.

---

## 2. Phase 1 primitive fixes

| Primitive | Change | Why |
| :--- | :--- | :--- |
| `Text` | `color` resolves a **token name** through `colors` first (`hasOwnProperty`, so `'constructor'` cannot leak `Object.prototype`) | Lets a caller pass `'textMuted'` and follow the palette; a raw hex still passes through untouched. |
| `Text` | Applies `typography.fontSans` on the non-mono path | The scale previously only set a family for `variant="code"`; everything else inherited whatever the host set. |
| `SegmentedControl` | Segment `minHeight` 32 → **44** (the touch floor); `md` track `minHeight` 48; label `flexShrink: 1` + `minWidth: 0` | `My Tasks (12)` set the width of all three segments and pushed the track off a 390pt screen. The brief asked for 40, but a control this size is the whole target — `hitSlop` is not an option for the default size. |
| `StatusPill` | Dot `flexShrink: 0`, label `flexShrink: 1` | The dot was the first flex child to absorb the squeeze and became a sliver. |
| `StatusPill` | Tone map gains `EN_ROUTE`, `STANDBY`, `WAITING_HANDOVER`, `AWAITING_HANDOVER` | `WAITING_HANDOVER` fell through to `neutral` (grey) while meaning "a human is blocking this job". |
| `TextField` | `onClear` defaults to `onChangeText('')`; hidden when `editable === false`; `accessibilityLabel` defaults to `label`; caller `placeholderTextColor` is no longer swallowed | Four small footguns in the most-used primitive. The last one silently discarded a prop that is in the public type. |
| `TextField` | Input text uses `typography.bodyMedium` + `fontSans` | It hardcoded `fontSize: 14` and set no family, so on web the field rendered in the browser default face while every label around it rendered in Inter. |
| `Card` | Pressable cards get `minWidth/minHeight: 44`; **`gap` and `contentStyle` props apply to the inner content wrapper** | A two-word fleet chip was a ~30pt target. The two new props exist because `style` lands on the *outer* card — a `gap` passed there is inert, which is how the Home hero card rendered its rows flush while the stylesheet claimed 14pt. |
| `Button` | `minWidth: 44`; `size="md"` 44 → **48**, `size="lg"` 48 → **52** | `Cancel` / `OK` produced a ~60x44 control. `md` is the size every primary action uses ("Start Handover", "Inspect Issue") and is hit one-handed while the other hand holds a scanner — 48 is the comfortable target, not the legal minimum. |
| `ScreenHeader` | Row is `minHeight: 48`, not a fixed height | A wrapped subtitle used to be clipped instead of growing the header. |
| `Text` | **`uppercase` prop deleted** | Zero call sites used it, and it was an ALL-CAPS escape hatch the new copy rule bans. |
| `ProgressMeter` | **New primitive** | Handover progress, battery and job progress were three copies of the same 4pt bar. |

`ProgressMeter` is the only addition to the barrel. It exists because the brief
specifies "a 4px meter progress bar in amber/blue" in three places, and the
alternative was a fourth divergent copy.

---

## 3. Shell

The shell lives in **`src/app/shell/`**, not `src/shared/components/`. It
navigates (`useNavigation`), so it sits *above* the feature layer; keeping it in
`shared/` would have made the leaf layer depend on the app layer. This also
leaves `src/shared/components/*` genuinely frozen.

### 3.1 `AppHeader` — `src/app/shell/AppHeader.tsx`

Two rows, Google-console framing:

```
row 1   [AT] Alex Tran  (Staff)          ● WMS Connected      (shield)
row 2   (⌖ Inbound Dock 01 ⌄)
```

- Top padding from `useTopInset()`, never a constant.
- **The zone picker, the account sheet and the safety sheet are `Modal`s.** The
  previous header measured its own height with `onLayout` and anchored popovers
  to it — correct until the inset changed underneath it, which it does on every
  device between an SE and a Dynamic Island.
- **Layout budget is tight and deliberate.** Row 1 has 358pt to spend on a 44pt
  avatar, a name, a role chip, a 125pt status pill and a 44pt button. Gaps are
  8pt, not 10pt: at 10pt the name truncated to `Alex Tr…` at 390pt wide. Longer
  names still ellipsize; the avatar initials stay legible, so the failure is
  graceful.
- Logout lives in the account sheet, after the shift summary, in `danger` on
  `dangerBg` — never a bare icon that can be hit by accident.
- **The header holds no overlay markup.** `ZonePickerModal`, `AccountSheet` and
  `SafetyActionSheet` are sibling files over a shared `SheetDialog` frame; the
  header keeps two rows, three booleans and the wiring. It was 519 lines with
  three copies of the same modal chrome inlined.

### 3.2 `SafetyActionSheet` — `src/app/shell/SafetyActionSheet.tsx`

Four exceptions, one bottom sheet: hold nearby robots (3m soft pause), report a
path hazard, report a cargo defect, view fleet maintenance. Each row states what
it **does** in one sentence rather than an exception code — the person reading it
is deciding whether to step into traffic.

The hold is **state, not a local toggle**. `SafetyHoldContext`
(`src/shared/context/`) owns it, because three surfaces act on it: the header
shield, this sheet, and the Transport hub. Before the context existed, holding
from the header left the Transport hub still reading "not holding".

**The hold says it is a simulation.** `SafetyHoldContext` flips a boolean and the
sheet re-renders; no AMR is told anything, because `POST /api/fleet/soft-hold` is
not wired. The hold row's subtitle carries `(Local Fleet Simulation)` and an
`info` notice under the list names the missing route. The header repeats it in
both toasts and in the shield button's `accessibilityHint`, and the Transport hub
says it too — three surfaces toggle the same switch, so all three have to be
honest about what it does.

**"Report Cargo Defect" opens the incident report**, `job_detail` with
`{ modal: 'issue' }`. It used to route to `payload_recovery`, which is the
chassis rescue flow: an operator reporting a crushed tote was taken to a screen
about lifting a stalled AMR off a pallet.

### 3.3 `BottomTabBar` — `src/app/navigation/BottomTabBar.tsx`

Flat, edge to edge, four tabs (`Home`, `Jobs`, `Live Map`, `Transport`), 12pt
Title Case labels. The old floating pill is gone: it was a deliberate Phase 0
decision that no longer matches the calm surface language, and content scrolling
under a bar reads better on a handheld than a pill floating over it.

- `position: absolute`, with the bottom inset applied as a **sibling strip** rather
  than a `paddingBottom` on the row: on a device with a home indicator a padding
  would inset the icons too, which is not what "clear the indicator" means.
- Still publishes its measured height through `NavigationContext`, so
  `dockReservedSpace(dockHeight)` remains the one way to clear it.
  `dockMetrics.bottomOffset` is now `0` and `gutter` is `16` — the bar sits
  flush on the physical edge.
- The Jobs badge is seeded from `countMyActiveJobs()` in `features/jobs/jobData`
  — the same helper the Jobs screen counts with. It used to be a hardcoded `1`
  sitting next to a list of four, which on a mission-critical handheld is worse
  than showing nothing.

### 3.4 Navigation

`MainTab` is now `'home' | 'jobs' | 'live_map' | 'transport'`, and
`isMainTabScreen()` is exported from `NavigationContext` so `AppNavigator` has a
single gate for "render the shell". Live Map is a tab root: it lost its
`SubScreenHeader` (the shell header owns the top now) and the tracked job moved
into a floating chip on the viewport. Its telemetry sheet offsets itself by
`dockReservedSpace(dockHeight)` instead of a constant `bottom: 14`, which is what
kept it clear of the new bar.

---

## 4. Pilot screens

### 4.1 Home — `src/features/home/HomeScreen.tsx`

Rebuilt from scratch. Three sections, in the order the operator asks the
questions: my task, my robots, the floor.

1. **Next handover task** — `StatusPill` (`ASSIGNED` rendered as `Waiting
   Handover`, amber) + job ID, an inset block with target location / cargo /
   assigned robot, an amber 4pt meter, and the screen's only filled primary
   button (`lg`, 52pt).
2. **Active fleet** — one card per AMR: status pill, destination, battery with a
   green meter, payload.
3. **Facility map thumbnail** — 150pt blueprint preview
   (`FacilityMapPreview.tsx`) plus a `Open Live Telemetry Map` CTA that switches
   to the `live_map` tab.

The old screen had a full-bleed map, a pan-responsive bottom sheet and a radar
sweep: three large surfaces for a job queue that is one glance wide. The preview
keeps the "where is my fleet" answer and hands over to the live screen for the
rest.

**The hero reads the job out of `jobData`.** It hardcoded
`BOX-101 · Electronics · 45 pcs` while the fixture said 12 — a quantity that
differs between the screen you act from and the screen you verify in. Target,
cargo, robot and status are now all `MOCK_JOBS[0]`'s, so there is exactly one
place to change them. The two fleet cards and the hero use `Card`'s new `gap`
prop instead of per-row `marginTop`, which the outer card style could not carry.

### 4.2 Jobs — `src/features/jobs/JobsScreen.tsx` + `JobCard.tsx`

- Title `Job Execution Center`, a `SegmentedControl` (My Tasks / Fleet Queue /
  History) and a `TextField` above a `FlatList`.
- Search matches job numbers, container codes, rack labels, endpoints, robot
  codes and workflow names, ignoring hyphens and spaces so `JOB20260812` finds
  `JOB-2026-0812`.
- Counts are **live**, not fixed: the brief's `My Tasks (2)` / `Fleet Queue (5)`
  were placeholders, and a count that disagrees with the list is worse than no
  count. They reflect the active query.
- **Scope is `JobStatus`, not a UI flag.** `history` is exactly the terminal
  states — `COMPLETED`, `FAILED`, `CANCELLED` — via `isTerminalJobStatus()`
  (`jobData.ts`); `mine` and `fleet` exclude them.
- **Deep links select the scope.** `?screen=jobs-history` and
  `?screen=jobs-global` map to `history` / `fleet`, read from `params.view`.
  The screen re-syncs on `params.view` rather than only as a `useState`
  initialiser, because `navigate('jobs', { view })` re-uses the instance instead
  of remounting it.
- **A zone filter chip reads `session.zone`.** Off by default — an operator
  checking the fleet still wants the whole fleet — and when on it reads
  `Filtered by Inbound Dock 01` with a clear affordance, because a filter that
  hides rows has to announce itself or the shorter list reads as "everything
  there is". Matching is text-based over the job's own place names, with a
  direction guard so `Inbound Dock 01` does not swallow `Outbound Dock Out 01`.
- Three empty states, not one: "no jobs match that search" offers **Clear
  search**; "nothing routed through <zone>" offers **Show all zones**; "no tasks
  assigned to you" points at the fleet queue instead of offering a button that
  would do nothing.
- `JobCard` reads top to bottom as *which job* → *where does it go* → *what is on
  it* → *what do I do*. Both its pill and its button come from a per-`JobStatus`
  table, so a `QUEUED` job never offers to start a handover against a robot that
  has not been assigned, and `FAILED` / `RECOVERY_REQUIRED` say *Inspect Issue*
  instead of pretending the job can still move.

**One lifecycle axis.** `AppJobItem.kind` (`waiting | transit | complete |
queued`) is gone. It duplicated `JobStatus` on the same fixture, which is how two
screens could disagree about one job; `JobCard`, `JobsScreen` and
`JobDetailScreen` now read `status` directly, and `jobData.ts` owns the two
predicates they share.

---

## 5. Copy rule

**Title Case, never ALL-CAPS.** The Phase 0 screens used `textTransform:
'uppercase'` with wide tracking for eyebrows and status tags; on a screen an
operator reads while walking, that reads as shouting. New UI gets no uppercase
transform at all — `StatusPill` humanises the status (`WAITING_HANDOVER` →
`Waiting handover`) and the screens pass an explicit `label` where Title Case
matters (`Waiting Handover`).

The last two main-tab holdouts are now clean: the Live Map telemetry badge reads
`Live Telemetry` at 11pt (it was 9pt at weight 900 in caps — below the type
scale *and* shouting), and Transport's section eyebrows read `Dispatch
Operations` and `Safety & Incident Hub` in Title Case without the 1.4pt tracking.
All four main tabs now speak the same language; the remaining caps are on the
un-migrated screens listed below.

---

## 6. What is still un-migrated

Everything not listed above still renders its own header and its own inline
styles inside the new shell, and is expected to look like itself:

`JobDetailScreen`, `TransportScreen`, `JobMonitoringScreen`, `JobLiveMapScreen`,
`InventoryLookupScreen`, `CreateContainerScreen`, `TransportCreationScreen`,
`TransportHistoryScreen`, `PointToPointScreen`, `ReplenishmentScreen`,
`PayloadRecoveryScreen`, `FleetRecallScreen`, `BlockPathHazardScreen`,
`OfflineBannerHUD`, `BarcodeScannerHUD`, `IssueReportingModal`, `LoginScreen`.

Migrating them is mechanical — swap `shared/components/*` for the barrel, drop
inline `fontSize`, delete the now-duplicate page header — and each one deletes
its `shared/components/*` dependency as it lands.

**Dead code note**: `HeroHandoverCard`, `FleetRobotCard` and `WarehousePulseCard`
were already orphaned before this phase (Phase 1 left them unreferenced); the Home
rebuild does not change that, so they are left for a dedicated cleanup rather
than deleted inside a redesign diff. `MiniFacilityMap.tsx` is still imported for
`ROBOT_HEADING_ARROW_PATH`, which the preview and the live map share so a robot
keeps one silhouette across screens; the component itself is the next thing to go.