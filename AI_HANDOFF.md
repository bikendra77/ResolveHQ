# ResolveHQ handoff

Updated: 2026-11-06

The canonical project root is the directory containing this file,
`package.json`, `.git`, `client/`, and `server/`. Open that directory in the
editor; do not run npm from a parent directory.

This note describes the implemented code, not the broader product plans in
[`docs/ResolveHQ_Architecture_Technical_Blueprint.pdf`](docs/ResolveHQ_Architecture_Technical_Blueprint.pdf).
The concise architecture and API references are
[`docs/architecture.md`](docs/architecture.md) and [`docs/api.md`](docs/api.md).

## What exists

ResolveHQ is an early-stage React/Vite client and Express API using MongoDB.
The client has login and registration pages, protected routing to an initial
authenticated `/app` shell, an in-memory access-token API client, and refresh-
based session restoration. Authenticated users load their organization
memberships; users without one are routed through an organization onboarding
form. The organization API creates an Organization and Owner Membership
atomically and resolves organization detail only after checking caller
membership.

The API currently exposes `GET /healthz` and:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`
- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/:organizationId`

Server startup validates environment values, connects to MongoDB before
listening, and handles graceful shutdown. `server/src/app.js` is independent of
database startup for HTTP tests. Persistent models are `User`, `RefreshToken`,
`Organization`, `Membership` and `Invitation`.

Invitation services/APIs, teams, projects, tasks, issues, boards, comments,
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
client/src/                  React app, auth context/client, screens, onboarding, shell
server/src/app.js            Express middleware, health, auth and org routers
server/src/server.js         Configuration, database startup, shutdown
server/src/config/           Environment, MongoDB lifecycle, Pino
server/src/middleware/       Authentication, tenant resolution, validation, errors
server/src/modules/auth/     Auth routes, controllers, schema, service, models
server/src/modules/organizations/         Organization routes, service, models
server/src/utils/            API errors, RBAC permissions, transaction utility
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

Organization endpoints require authentication. The organization detail lookup
requires a Membership matching both the authenticated user and the requested
organization ID; inaccessible or malformed organization IDs return 404.
Creation ignores no user-provided ownership fields: strict input validation
rejects them, and the creator and Owner Membership are derived from the
authenticated identity. The Organization and Membership writes share the
existing transaction session.

These are implemented behaviors, not a claim that the full security checklist
has been completed. There is no configured production CORS allowlist or
deployment reverse proxy in this codebase.

## Local setup and commands

Use Node.js 22+ and npm. From the canonical project root:

```powershell
npm install
npm run dev
```

Before starting, ensure `server/.env` exists and has a fresh random
`JWT_ACCESS_SECRET` of at least 32 characters and a reachable `MONGODB_URI`.
Create it only if absent; never overwrite it or commit it:

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

`npm run dev` starts both the Vite client and API; the API runs without watch
mode so configuration or database startup failures stop both processes.
Restart the command after server changes. It chooses an available client port
starting at `5173` and sets the matching API origin for that run. For separate
terminals and API watch mode, use `npm run dev:client` and `npm run dev:server`;
set `CLIENT_ORIGIN` to the exact Vite origin in that setup. The API defaults
to port `4000`. Vite proxies `/api` and `/healthz` to the API. The API requires
a reachable MongoDB instance before it listens. Do not commit `.env` files.
Client settings are documented in `client/.env.example`; `VITE_*` values are
public and must not contain secrets.

Available commands from the canonical project root:

```text
npm run dev             Start frontend and backend together
npm run dev:client      Start Vite independently
npm run dev:server      Start API with Node watch mode
npm run start:server    Start API normally
npm run build           Build client
npm run lint            Lint workspaces
npm run format          Format workspaces
npm run format:check    Check formatting
npm test                Run client and server suites
```

If npm reports that it cannot find `package.json`, make sure the terminal is
at the canonical root. If Vite reports `ECONNREFUSED`, check the API process,
MongoDB availability, port `4000`, and the `MONGODB_URI` in `server/.env`.
Configuration errors identify invalid variable names without printing values.
Organization creation requires a replica set or sharded MongoDB deployment.
The existing local standalone topology is rejected with
`503 TRANSACTIONS_UNAVAILABLE`; no nontransactional fallback is provided.

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
auth and organization behavior with mocked persistence, frontend onboarding,
environment validation, authentication and tenant model schemas, transaction
utility behavior with mocked sessions, rate-limits, database lifecycle,
health, and server startup/shutdown. A separate opt-in suite exercises
authentication against MongoDB. Mocked organization/transaction tests do not
verify live MongoDB transaction support.

Validation performed for the project-root and development-workflow fix:

- `npm install` completed successfully at the canonical root.
- `npm test` passed with MongoDB integration enabled: 13 client tests and 37
  server tests, including all seven MongoDB-backed integration tests.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm run build` passed.
- `npm run dev` started both services and connected to MongoDB using a
  temporary process-only test secret. The Vite-proxied health check returned
  `200`; an empty login reached API validation (`422`), and refresh with the
  matching development origin returned the expected `401` without a cookie.
- Local `.env` files are ignored and their values are not recorded here. Check
  `server/.env.example` if startup reports an invalid variable; never paste
  secret values into logs, documentation, or chat.

Validation performed for organization onboarding and tenant resolution:

- Targeted organization backend tests passed (10 tests); client auth/onboarding
  tests passed (16 tests).
- `npm test` passed: 16 client tests, 82 server tests, and 4 development
  launcher tests passed; 7 opt-in MongoDB tests were skipped.
- `npm run lint`, `npm run format:check`, and `npm run build` passed.
- `git diff --check` passed. No files were staged, committed, or pushed.
- Organization/Owner atomicity and rollback were exercised with mocked
  persistence only. The local MongoDB server is standalone, so organization
  creation was not run against it and replica-set transaction compatibility
  remains unverified.

The full browser login/registration session, hosted GitHub Actions result,
production deployment, multi-instance rate limiting, and remaining production
security hardening remain unverified. `npm install` also reported four
moderate dependency audit advisories; no dependency upgrades were applied.

## Suggested next steps

1. Verify organization creation on a transaction-capable MongoDB replica set
   and exercise the complete browser session flow.
2. Decide and document the intended production hosting and same-origin proxy
   before deployment; review CORS, trusted proxy behavior, and distributed rate
   limiting for the target environment.
3. Implement product-domain features only after their authorization and
   tenant-scoping model is defined and tested.
