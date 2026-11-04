# 03 — Frontend Package Model

**Audit date:** 2026-11-03  
**Repo:** `warotrans-system`

---

## Applications (VERIFIED)

| Package | npm name | Path | Stack | Audience |
|---|---|---|---|---|
| `web` | `warotrans-web` | `web/` | React 19 + Vite 8 + TS + Tailwind 4 + React Router 7 + TanStack Query + SignalR | Admin console (ADMIN role gated) |
| `app` | `warotrans-app` | `app/` | Expo ~57 + React Native 0.86 + TS + TanStack Query + SignalR | Staff mobile |

**Not present:** AdminWeb/StaffWeb as separate web apps; Next.js; monorepo `packages/*`; shared UI library between web and app.

---

## Package hierarchy — `web`

```text
web
├── web.app                 # shell / chrome (AppShell, layout helpers)
├── web.features
│   ├── accounts
│   ├── auth
│   ├── dashboard
│   ├── jobs
│   ├── management
│   ├── maps                # includes maps/editor
│   ├── notifications
│   ├── robots              # includes robots/manual
│   ├── transport-requests  # includes composer
│   └── workflows
└── web.shared
    ├── api
    ├── lib
    ├── map
    ├── realtime
    └── ui
```

**Paths:** `web/src/app`, `web/src/features/*`, `web/src/shared/*`  
**Alias:** `@/*` → `src/*`

### Responsibilities

| Package | Purpose |
|---|---|
| `web.app` | Application chrome and composition helpers |
| `web.features.*` | Feature screens and feature-local logic |
| `web.shared.api` | REST client + domain API modules |
| `web.shared.ui` | Shared UI primitives |
| `web.shared.map` | Warehouse map visualization |
| `web.shared.realtime` | SignalR notifications hub hook |
| `web.shared.lib` | Formatting / helpers |

### Verified dependency direction

```text
web.app → web.features.* → web.shared.*
```

Limited cross-feature imports (VERIFIED exceptions):

- `management` → `accounts`, `auth`
- `maps` → `workflows` (workflow editor embedding)
- `transport-requests` → `auth`, `jobs` helpers
- `robots/manual` → `maps` components

`web.shared` does not import features.

### Backend integration (runtime)

- REST: `web/src/shared/api/client.ts` → Host `/api/*` (Vite proxy `/api`, `/hubs`, `/map-assets`)
- SignalR: `web/src/shared/realtime/useNotificationsHub.ts` → `/hubs/notifications`
- Auth: cookie refresh + Bearer — `features/auth`

---

## Package hierarchy — `app`

```text
app
├── app.app
│   ├── navigation
│   ├── providers
│   └── shell
├── app.features
│   ├── auth
│   ├── home
│   ├── inventory
│   ├── jobs
│   ├── monitoring
│   ├── safety
│   └── transport
└── app.shared
    ├── api
    ├── components
    ├── context
    ├── realtime
    ├── theme
    ├── types
    ├── ui
    └── utils
```

**Paths:** `app/src/app/*`, `app/src/features/*`, `app/src/shared/*`  
**Composition root:** `app/App.tsx` + `app/src/app/navigation/AppNavigator.tsx`

### Verified dependency direction

```text
app.app → app.features.* → app.shared.*
```

Features do **not** import other features (VERIFIED pattern). Features may import `app.navigation` for navigation hooks.

### Backend integration (runtime)

- REST: `app/src/shared/api/client.ts` → `EXPO_PUBLIC_API_URL`
- SignalR: `app/src/shared/realtime/*`
- Auth tokens in SecureStore

---

## Shared libraries between web and app

**VERIFIED: none.** Duplicated API clients and contracts.

---

## UML diagram guidance

1. Outer logical package `UserApplications`.
2. Nested literal packages `web` and `app`.
3. Optionally expand one level of `*.app`, `*.features`, `*.shared` on the User Applications subsystem diagram.
4. Do not invent `receiving`, `containers`, `issues` feature packages (mentioned in rules examples but **absent** on disk).
5. Draw runtime dependency to Backend Host only with `«runtime REST+SignalR»` if shown at all.
