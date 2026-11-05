# ResolveHQ

ResolveHQ is a project-management and issue-tracking application planned as a React/Vite client and an Express API. The backend foundation includes MongoDB connectivity and the initial authentication endpoints; organizations, project/task APIs, and frontend authentication are not implemented.

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
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
npm run dev:server
```

The server connects to MongoDB before listening on port `4000`. The example URI targets a local MongoDB instance; install and start MongoDB locally, or replace `MONGODB_URI` in `server/.env` with your own Atlas connection string. Never commit the `.env` file or share its credentials. Environment values are validated at startup. `GET http://localhost:4000/healthz` returns a basic health response without database details.

Set `JWT_ACCESS_SECRET` in `server/.env` to a random secret of at least 32 bytes, replacing the example placeholder. If `server/.env` already exists, preserve it and add the required variable instead of copying over it. Login and registration requests are rate-limited; production login limits apply per IP and normalized email. You can generate a secret value locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The example's JWT secret is only a placeholder and must be replaced. `CLIENT_ORIGIN` defaults to `http://localhost:5173` in development. Authentication endpoints are `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/logout-all`, and `GET /api/v1/auth/me`. Refresh tokens are stored hashed and sent in a secure, HttpOnly cookie; access tokens expire after 15 minutes.

`npm test` runs the unit tests and mocked authentication HTTP tests without
connecting to MongoDB. The real authentication persistence tests are opt-in and
use a unique database on a local MongoDB server at `127.0.0.1:27017`; they drop
that database after the run. To include them from the repository root in
PowerShell:

```powershell
$env:RESOLVEHQ_MONGODB_INTEGRATION = '1'
npm test
```

GitHub Actions provisions its own MongoDB service and enables these tests.
Local runs require MongoDB listening on `127.0.0.1:27017`; no developer or
production database URI is used by the integration suite.

## Checks

From the repository root, run `npm run lint`, `npm run format`, `npm run format:check`, `npm run build`, or `npm test`.

See [docs/architecture.md](./docs/architecture.md) for the current foundation diagram. The supplied architecture blueprint remains the source of truth for planned phases.
