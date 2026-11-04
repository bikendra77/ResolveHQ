# ResolveHQ

ResolveHQ is a project-management and issue-tracking application planned as a React/Vite client and an Express API. This repository contains the Phase 1 foundation only; authentication, persistence, product APIs, and user-facing features are not implemented.

## Requirements

- Node.js 22 or newer
- npm

## Run the client

From the repository root:

```powershell
npm ci
npm run dev
```

Vite serves the client locally and proxies future `/api` requests to `http://localhost:4000`.
To customize its display name, copy `client/.env.example` to `client/.env`. Vite variables are public and must never contain secrets.

## Run the server

In a separate terminal, from the repository root:

```powershell
Copy-Item server/.env.example server/.env
npm run dev:server
```

The Express server listens on port `4000` by default. `GET http://localhost:4000/healthz` returns a basic health response. Environment values are validated at startup; `.env.example` contains placeholders/defaults only.

## Checks

From the repository root, run `npm run lint`, `npm run format:check`, `npm run build`, or `npm test`.

See [docs/architecture.md](./docs/architecture.md) for the current foundation diagram. The supplied architecture blueprint remains the source of truth for planned phases.
