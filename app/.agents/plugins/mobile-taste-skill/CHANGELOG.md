# Changelog

## 0.2.0 (2026-07-02)

**One skill becomes a six-skill suite**, restructured after researching the upstream
taste-skill sub-skills, Anthropic's official skill conventions, and the strongest
community design suites (gstack's five design skills, Superdesign's screenshot loops,
shadcn's config-sniffing).

### Added
- **Five task-scoped skills** alongside the core builder, each with a discriminating
  "Use when…" description and cross-redirects (overlapping triggers are the #1
  multi-skill failure mode):
  - `mobile-nav-plan` - Nav Read generator, no screens
  - `mobile-design-system` - SAFE/RISK proposal → real theme files + MOBILE-DESIGN.md
  - `mobile-design-review` - rated findings, Design Score + AI Slop Score (mechanical
    letter math), `design-baseline.json` regression deltas, opt-in fix mode
  - `mobile-redesign-screen` - audit-first single-screen modernization
  - `mobile-redesign-app` - phased whole-app redesign; the only skill allowed to
    propose navigation restructuring (approval-gated)
- **`skills/_shared/`** - single canonical home for references and blocks, cited by
  every skill (no duplication, no drift): `tells.md` (the 40-tell catalog + runnable
  grep checklist, extracted from the core), new `review-rubric.md` (two passes,
  first-impression narration, Trunk Test, ten categories, scoring math) and
  `redesign-protocol.md` (audit, modernization levers, fix loop, risk governor).
- **Core `mobile-taste` upgrades** imported from the research: Step-0 stack sniff
  (read package.json/app.json/theme config before generating), the MOBILE-DESIGN.md
  durable artifact (App Read/Nav Read/dials/tokens persist across sessions, refreshed
  with deltas), the signature-element rule (one bold move per screen), a per-app-kind
  category bias table, the mobile font convergence trap (Poppins/generic-geometric),
  and a blocks-first rule.

### Changed
- Tells #41 (THE DEAD SETTING) and #42 (DESTRUCTIVE RESIDUE) added - both discovered by
  running mobile-design-review against a sibling-skill-generated app during QA, which
  also hardened the scoring math (numeric with letter bands, mean capped at B while any
  high-impact finding is open) and clarified report-only semantics.
- `references/` and `blocks/` moved from `skills/mobile-taste/` to `skills/_shared/`.
- Core §10 slimmed to the ten most-recognizable tells + pointer; §11 now routes to the
  redesign skills. Tell numbering is append-only and lives in `tells.md`.
- marketplace.json now enumerates all six skills explicitly.

### Deliberately not added (evaluated, rejected)
- Aesthetic-preset skills (ios-native / playful as separate skills) - on mobile,
  aesthetics couple to platform posture; they stay internal to the App Read + dials.
- Variant-shotgun generation + cross-session taste memory - strong mechanism, deferred
  to a future release.
- Fake-randomization "variance engines" and web slop-list items that don't apply to
  mobile.

## 0.1.0 (2026-07-02)

Initial release: the `mobile-taste` skill - App Read + Nav Read commitments, three
dials with the chrome-lags-content rule, 40-item mobile AI-tells catalog with
mechanical grep checks, canonical Reanimated skeletons with named LLM failure modes,
navigation decision tree with worked examples, six seed blocks, and an honest
pre-flight checklist (grep-checkable vs requires-device). React Native adaptation
inspired by Leonxlnx/taste-skill, which scopes out native mobile.
