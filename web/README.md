# WaroTrans Web (Admin console)

## Run locally

1. Start PostgreSQL and MongoDB: `docker compose up -d postgres mongodb` in `infrastructure/` (copy `.env.example` to `.env` first).
2. Start the API: `dotnet run --project backend/src/WaroTrans.Host --launch-profile http` (listens on `http://localhost:5090`).
3. Start the web app: `npm run dev` in `web/` and open `http://localhost:5173`.

Open the app on `localhost`, not `127.0.0.1`: the API only allows the origins listed under `Cors:AllowedOrigins`,
and the refresh cookie is `SameSite=Strict`.

## Signing in

The web console is for `ADMIN` accounts only; `STAFF` accounts are refused after sign-in.
In Development the API seeds two accounts (never present outside a Development database):

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | ADMIN |
| `staff` | `Staff@123` | STAFF |

The access token is kept in memory only. The refresh token is an HttpOnly cookie, so a page reload restores the
session through `POST /api/identity/refresh`.

Set `VITE_MOCK_AUTO_LOGIN=true` in `.env.local` to skip sign-in and work on the mock-data screens without the API.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
