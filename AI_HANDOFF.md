# ResolveHQ handoff

Updated: 2026-11-05

This note describes the implemented code, not the broader product plans in
[`docs/ResolveHQ_Architecture_Technical_Blueprint.pdf`](docs/ResolveHQ_Architecture_Technical_Blueprint.pdf).
The concise architecture and API references are
[`docs/architecture.md`](docs/architecture.md) and [`docs/api.md`](docs/api.md).

## What exists

ResolveHQ is an early-stage React/Vite client and Express API using MongoDB.
The client has login and registration pages, protected routing to an initial
authenticated `/app` shell, an in-memory access-token API client, and refresh-
based session restoration. The only domain module is authentication.

The API currently exposes `GET /healthz` and:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`

Server startup validates environment values, connects to MongoDB before
listening, and handles graceful shutdown. `server/src/app.js` is independent of
database startup for HTTP tests. Persistent models are `User` and
`RefreshToken`.

Organizations, teams, memberships, projects, tasks, issues, boards, comments,
notifications, activity feeds, analytics, deployment manifests, and seed/demo
data are not implemented. Do not describe the application as feature-complete
or production-ready.

## Stack and repository layout

- Node.js `>=22`, npm workspaces
- Client: React 19, Vite 7, Tailwind CSS 4
- Server: Express 5, Mongoose 9, MongoDB
- Auth/security: Zod, bcrypt, JWT, `express-rate-limit`
- Tests/tooling: Vitest, Supertest, ESLint, Prettier; GitHub Actions workflow
  under `.github/workflows/ci.yml`

```text
client/src/                  React app, auth context/client, screens, shell
server/src/app.js            Express middleware, health, auth router
server/src/server.js         Configuration, database startup, shutdown
server/src/config/           Environment, MongoDB lifecycle, Pino
server/src/middleware/       Authentication, validation, error handling
server/src/modules/auth/     Auth routes, controllers, schema, service, models
server/tests/                Unit, mocked HTTP, and opt-in MongoDB suites
docs/                        Current architecture and API reference
```

## Authentication/security behavior

- Passwords are bcrypt-hashed. Registration names are trimmed; email is
  normalized to lowercase. Public responses omit password hashes.
- Access JWTs use HS256 and a fixed 15-minute lifetime. The client stores them
  in module memory, not browser storage.
- Refresh tokens are random opaque values; only SHA-256 hashes are stored.
  Tokens rotate on refresh and use a seven-day Secure, HttpOnly,
  SameSite=Strict cookie scoped to `/api/v1/auth`.
- Refresh, logout, and logout-all require an exact `Origin` match to
  `CLIENT_ORIGIN`. Logout-all increments token version to invalidate existing
  access JWTs. Single-session logout does not immediately invalidate an
  already-issued access token.
- Registration, login, and refresh are rate-limited with in-memory stores.
  Those limits are not shared across instances.
- Pino redacts credential/token fields. Do not log secrets or raw tokens.

These are implemented behaviors, not a claim that the full security checklist
has been completed. There is no configured production CORS allowlist or
deployment reverse proxy in this codebase.

## Local setup and commands

Use Node.js 22+ and npm. From the project root:

```powershell
npm ci --include=optional
npm run dev
```

Start the API in a second terminal. Create `server/.env` only if it does not
already exist, then replace the placeholder `JWT_ACCESS_SECRET` with a
random value of at least 32 characters and configure `MONGODB_URI`:

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
npm run dev:server
```

The API defaults to port `4000`; Vite proxies `/api` there. The server requires
a reachable MongoDB instance before it listens. Do not commit `.env` files.
Client settings are documented in `client/.env.example`; `VITE_*` values are
public and must not contain secrets.

Available root commands:

```text
npm run dev             Start Vite
npm run dev:server      Start API with Node watch mode
npm run start:server    Start API normally
npm run build           Build client
npm run lint            Lint workspaces
npm run format          Format workspaces
npm run format:check    Check formatting
npm test                Run client and server suites
```

The default test run does not require MongoDB. To opt in to the integration
suite, run MongoDB at `127.0.0.1:27017`, then:

```powershell
$env:RESOLVEHQ_MONGODB_INTEGRATION = '1'
npm test
```

The integration suite uses a unique local database and drops it during
teardown; it does not use a developer or production `MONGODB_URI`. The CI
workflow provisions MongoDB and enables the suite.

## Verification state

Automated coverage exists for mocked frontend auth/API behavior, backend HTTP
auth behavior with mocked persistence, environment validation, models,
rate-limits, database lifecycle, health, and server startup/shutdown. A
separate opt-in suite exercises authentication against MongoDB.

Validation performed for this documentation update:

- `npm test` passed: 13 client tests and 30 server tests; the seven
  MongoDB-backed integration tests were skipped because the opt-in flag was not
  set.
- `npm run lint` passed.
- `npm run format:check` passed.
- Prettier check passed for the four updated documentation files.

The client production build, live browser-to-API behavior, and hosted GitHub
Actions result were not verified in this update. A passing unit or mocked HTTP
suite does not verify browser-to-API behavior. Production deployment,
multi-instance rate limiting, and the remaining production security hardening
remain unverified.

## Suggested next steps

1. Run the client through Vite and the API against a local MongoDB instance to
   verify the complete browser session flow.
2. Decide and document the intended production hosting and same-origin proxy
   before deployment; review CORS, trusted proxy behavior, and distributed rate
   limiting for the target environment.
3. Implement product-domain features only after their authorization and
   tenant-scoping model is defined and tested.
