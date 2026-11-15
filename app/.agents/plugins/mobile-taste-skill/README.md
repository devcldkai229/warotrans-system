# mobile-taste-skill

**Anti-slop design taste for React Native / Expo apps.** A suite of Claude Code skills
that stops AI agents from generating the mobile UI everyone can spot from across the
room: indigo gradients, five-tab bars with a floating FAB, screens made of white
rounded card stacks, emoji icons, and "Welcome back, John! 👋".

Built by [Draftbit](https://draftbit.com). A React Native adaptation inspired by
[Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT), which covers web
frontends and explicitly leaves native mobile out of scope. This suite fills that gap.

## The skills

| Skill | Owns | Use when |
|---|---|---|
| `mobile-taste` | **Building** new screens, features, apps | "build me a…", new feature work |
| `mobile-nav-plan` | **Navigation architecture** only (the Nav Read: tabs, route tree, modal/sheet calls, deep links, Android back) | planning or restructuring navigation, before any code |
| `mobile-design-system` | **Tokens + theme**: SAFE/RISK proposal → real NativeWind/StyleSheet theme files + MOBILE-DESIGN.md | starting a visual identity; an app full of inline styles |
| `mobile-design-review` | **Auditing**: rated findings, Design Score + AI Slop Score, regression baseline; opt-in fix mode | "review / audit / critique my app's design" |
| `mobile-redesign-screen` | **Redesigning one screen** (or one small flow), audit-first, atomic commits | "make this screen nicer" |
| `mobile-redesign-app` | **Whole-app redesign** in phases; the only skill allowed to propose nav restructuring (approval-gated) | "modernize / rebrand the whole app" |

**Which one should I use?**
- Nothing exists yet → `mobile-nav-plan` (structure), then `mobile-design-system`
  (identity), then `mobile-taste` (build). Or just `mobile-taste`, which does light
  versions of both reads inline.
- App exists, want to know what's wrong → `mobile-design-review`.
- App exists, want it improved → `mobile-redesign-screen` (one screen) or
  `mobile-redesign-app` (all of it).

## How it works

Every skill forces commitment before code: an **App Read** (app kind, audience, vibe,
platform posture), a **Nav Read** (the full route tree, which doubles as the Expo
Router `app/` plan), and three explicit dials (`DESIGN_EXPRESSION`, `MOTION_INTENSITY`,
`VISUAL_DENSITY`) with hard floors (44pt touch targets, reduced motion, UI-thread
animation). Those commitments persist in a **`MOBILE-DESIGN.md`** file at the project
root so later sessions and other agents stay consistent.

The shared knowledge lives once, in `skills/_shared/`:

```
skills/
  _shared/
    references/
      tells.md               the slop-tell catalog (append-only) + runnable grep checklist
      navigation.md          container decision tree, Expo Router conventions, worked Nav Reads
      skeletons.md           canonical Reanimated/gesture code + named LLM failure modes
      review-rubric.md       audit passes, Trunk Test, finding format, scoring math
      redesign-protocol.md   audit checklist, modernization levers, risk governor
      versions.md            ALL version-sensitive facts, dated (Expo moves fast)
    blocks/                  proven screen patterns (onboarding, auth, feed, settings,
                             paywall, empty states) - searched before hand-rolling
  mobile-taste/              + the five task skills, each a single SKILL.md
```

## Install

### As a Claude Code plugin (all six skills)

```bash
claude plugin marketplace add draftbit/mobile-taste-skill
claude plugin install mobile-taste-skill
```

### Manual

```bash
git clone https://github.com/draftbit/mobile-taste-skill
cp -r mobile-taste-skill/skills/* ~/.claude/skills/
```

Installing a single skill manually? Copy `skills/_shared/` alongside it - every skill
reads its references from `../_shared/`.

## Default stack (and what else is covered)

Defaults to **Expo + Expo Router + NativeWind + React Native Reusables + Reanimated**,
with a stack map for React Native Paper (Material briefs), HIG-native iOS, Tamagui, and
plain StyleSheet. Every skill starts with a **stack sniff** - the project's existing
`package.json`/`app.json`/theme config always wins over defaults.

## Contributing

The tells catalog and the block library grow by observation: generate an app, spot a
new slop signature, open a PR naming it (binary ban + correct alternative + grep check
if one exists; numbering is append-only). Blocks follow the schema in
`skills/mobile-taste/SKILL.md` Section 12.

## License

MIT. See [LICENSE](./LICENSE). Inspired by and structurally indebted to
[taste-skill](https://github.com/Leonxlnx/taste-skill) by Leonxlnx (MIT).
