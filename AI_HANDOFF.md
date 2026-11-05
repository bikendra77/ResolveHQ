# ResolveHQ AI Handoff

Prepared: 2026-11-05

This handoff describes the checked-out project and working tree at the time it
was prepared. The architecture source of truth is
[`docs/ResolveHQ_Architecture_Technical_Blueprint.pdf`](docs/ResolveHQ_Architecture_Technical_Blueprint.pdf);
the shorter current-state diagram is in [`docs/architecture.md`](docs/architecture.md).
Do not treat planned blueprint features as implemented.

## 1. Project overview

ResolveHQ is planned as a project-management and issue-tracking SaaS for small
development teams, freelancers, and software agencies. Its intended architecture
is a modular monolith with a React client and an Express API backed by MongoDB.

Implemented so far:

- React/Vite client foundation and Express server foundation.
- MongoDB connection lifecycle and health endpoint.
- Backend authentication endpoints for registration, login, refresh, logout,
  logout-all, and the current-user profile.
- Unit/mocked authentication coverage and opt-in MongoDB-backed integration
  coverage. GitHub Actions provisions MongoDB and enables the integration
  suite.

Not implemented: frontend authentication, organizations and team management,
projects, tasks, issues, Kanban, comments, notifications, activity logs,
analytics, and deployment configuration.

Stack: React 19, Vite 7, Tailwind CSS 4, Node.js (project engine `>=22`), Express
5, Mongoose 9, MongoDB, Zod, bcrypt, JWT, Pino, Vitest, Supertest, ESLint, and
Prettier. npm workspaces use one root `package-lock.json`.

## 2. Project architecture

```text
.
├── .github/workflows/ci.yml
├── client/
│   ├── src/App.jsx
│   ├── src/main.jsx
│   ├── src/index.css
│   ├── vite.config.js
│   └── .env.example
├── docs/
│   ├── ResolveHQ_Architecture_Technical_Blueprint.pdf
│   └── architecture.md
├── server/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/{db,env,logger}.js
│   │   ├── middleware/
│   │   ├── modules/auth/
│   │   │   ├── auth.{controller,rate-limit,routes,schema,service}.js
│   │   │   └── models/{refresh-token,user}.model.js
│   │   └── utils/api-error.js
│   ├── tests/{integration,unit}/
│   └── .env.example
├── package.json
├── package-lock.json
├── README.md
└── AI_HANDOFF.md
```

`client/src/App.jsx` is a placeholder foundation screen, not an application
dashboard. Vite development configuration proxies `/api` to the server.
`server/src/app.js` constructs the Express app and can be imported without
starting a database connection. `server/src/server.js` owns database startup,
HTTP listen, and graceful signal handling.

The API currently exposes `GET /healthz` and the auth routes `POST
/api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/logout-all`, and
`GET /api/v1/auth/me`. No organizations, projects, tasks, issues, or other
domain API modules exist.

## 3. Completed work

Committed foundation and database work:

- Initial client/server workspaces, scripts, formatting/lint setup, and CI.
- Root npm workspace lockfile and cross-platform optional dependency install
  handling (`npm ci --include=optional` in CI).
- Environment validation, Pino logging, safe error handling, request IDs, and
  `/healthz`.
- Mongoose connection/disconnection helpers. Server startup waits for MongoDB
  before listening; shutdown stops the HTTP server and disconnects MongoDB.
- Test isolation from ignored local dotenv settings.

Current uncommitted authentication work:

- User and refresh-token Mongoose models.
- Registration, login, refresh, logout, logout-all, and current-user profile
  endpoints and services.
- Zod request validation, bcrypt password hashing, access JWT issuance,
  refresh-token hashing/rotation/reuse handling, cookies, origin checks, auth
  middleware, and rate limiting.
- Mocked auth tests, MongoDB-backed integration tests, and documentation/CI
  updates.

The authentication files are part of the working tree, not the latest commit.
See [Git history and working tree](#10-git-history-and-working-tree) for the
exact file inventory.

## 4. Current progress

### Working / covered locally

- Client and server workspace scripts.
- Environment parsing and validation.
- MongoDB startup/shutdown lifecycle unit tests.
- `/healthz` HTTP test and request ID behavior.
- Authentication endpoint behavior in Supertest with mocked model persistence.
- Authentication persistence against an isolated MongoDB test database,
  including registration/login, refresh rotation/replay, concurrent
  refresh/reuse, logout, logout-all, token-version invalidation, and logout-all
  without an Origin header.
- Model schema/index shape and rate-limit response tests.
- Lint, formatting checks, frontend production build, and the server test suite
  have passed in the current work period (details in [Testing](#9-testing)).

### Partial / not yet verified end-to-end

- The original auth endpoint suite mocks persistence. A separate opt-in suite
  now exercises auth persistence against a unique local MongoDB test database.
- Authentication middleware is mounted on `/api/v1/auth/me` and
  `/api/v1/auth/logout-all`.
- Auth includes logout-all and the current-user profile endpoint; it does not
  include the rest of the blueprint's account-management endpoints.
- The client has no login/register screens, AuthProvider, ProtectedRoute, or
  refresh-aware API client.
- The current local `server/.env` exists and is ignored, but its values were not
  inspected for this handoff. Do not assume it is correctly configured.
- The last local full validation recorded here ran on Node v24.13.0 and npm
  11.6.2. CI is configured for Node 22; re-run there or in the workflow before
  treating Node 22 compatibility of these uncommitted changes as verified.

The MongoDB-backed auth suite has been run locally against a unique database on
`127.0.0.1:27017`. It never reads or connects to the configured developer or
production database URI. CI now provisions a MongoDB service and explicitly
enables the suite; the workflow itself has not yet been observed running on
GitHub Actions.

## 5. Development roadmap

The blueprint specifies sequential phases, not calendar-day estimates. It says
to measure early phases before estimating the rest; do not invent day-by-day
dates. The earlier “Day 1” and “Day 2” labels correspond to foundation and
database setup work.

1. **Foundation and architecture — implemented.** Client/server workspaces,
   server skeleton, configuration, health check, lint/format, and CI.
2. **Database schemas and authentication — in progress.** User and refresh
  token models, registration/login/refresh/logout/logout-all, and current-user
  profile routes exist. Remaining blueprint scope includes the other
  collection schemas/indexes and frontend login/register, AuthProvider,
  ProtectedRoute, and refresh-aware `apiClient`.
3. **RBAC and team management — not started.** Organizations, memberships,
   invitations, roles/permissions, authorization context/middleware, and UI.
4. **Projects, tasks, and issue tracking — not started.** Project membership,
   CRUD, filtering, sorting, pagination, numbering, soft deletion, and API docs.
5. **Kanban, comments, and notifications — not started.** Board/movement
   behavior, comments, notification subscribers, unread state, and UI.
6. **Activity logs and analytics — not started.** In-process event flow,
   append-only activity records, timelines, aggregations, and dashboard.
7. **Security hardening and automated testing — partial / mostly future.**
   Basic authentication rate limits and log redaction exist; the full blueprint
   checklist, Helmet, production CORS allowlist, sanitization, and remaining
   test matrix still need review and implementation.
8. **Deployment, documentation, and presentation — not started.** Vercel,
   Render, Atlas, deployment checks, demo seed, screenshots, API docs, and demo.

### Exact next task

Implement the blueprint's client login/register flow, AuthProvider,
ProtectedRoute, and refresh-aware API client. Do not start RBAC or
project-management features before completing Phase 2.

## 6. Authentication

Implemented routes:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`

Behavior and security decisions in the current code:

- Registration trims names, normalizes email to lowercase, validates strict
  request shapes, and hashes passwords with bcrypt. Registration requires
  passwords of 10–72 UTF-8 bytes; login accepts 1–72 bytes.
- User email is unique and normalized in the Mongoose schema. Password hash is
  `select: false`, and model JSON/object transforms omit the hash.
- Login uses a dummy bcrypt hash for unknown emails and returns a generic
  invalid-credentials response.
- Access JWTs use HS256, a 15-minute TTL, fixed issuer/audience, user ID subject,
  and token-version claim. Middleware verifies the algorithm, issuer, audience,
  expiry, subject format, user status, and token version.
- Refresh tokens are random opaque values. Only SHA-256 token hashes are stored;
  records include a family, expiry, revocation timestamp, and the user's token
  version at issuance. Refresh rejects tokens from an older version and rotates
  valid tokens. Replay of a revoked token increments the user's token version
  before family cleanup, invalidating older refresh and access tokens even if
  bulk revocation subsequently fails.
- Refresh tokens are delivered in a Secure, HttpOnly, SameSite=Strict cookie
  scoped to `/api/v1/auth`. Refresh and logout require an exact `Origin` match.
  Login and registration return the access token and public user data; the
  refresh token is only set as a cookie.
- Centralized errors and Pino redaction are configured to avoid exposing
  password/token fields. Do not add secret-bearing request or exception logging.
- Registration is rate limited to 5 per 15 minutes; login to 10 per IP and 10
  per normalized email per 15 minutes; refresh to 30 per 15 minutes. Test mode
  uses a high limit. The current rate-limit stores are in-memory and therefore
  not shared across instances.

Individual logout revokes the presented refresh token but does not increment
token version, so an already-issued access JWT remains usable until its
15-minute expiry. Logout-all increments token version before bulk refresh-token
cleanup, invalidating existing access tokens and refresh tokens. If bulk cleanup
fails, the client receives an error and the refresh cookie is still cleared;
the stored token version also prevents that stale refresh token from being used.

## 7. Project management

The only module under `server/src/modules/` is `auth`. No organization,
membership, project, task, issue, comment, notification, activity, or analytics
models/routes/UI have been implemented. These are planned according to the
blueprint's phases 3–6; do not imply otherwise in docs or UI.

The blueprint calls for a modular monolith organized into routes/controllers,
services, models, middleware, and configuration. Preserve tenant scoping and
permission checks as those future modules are introduced; do not prematurely
add unrelated domain features to the auth milestone.

## 8. Database

`server/src/config/db.js` exports reusable `connectDatabase()` and
`disconnectDatabase()` functions. It uses validated `MONGODB_URI`, Mongoose
pool settings (`maxPoolSize: 10`, `minPoolSize: 0`) and a 5-second server
selection timeout. Logs report connection outcomes/error names without logging
the URI or raw error message.

`server/src/server.js` connects before calling `listen`; a connection failure
prevents listening. SIGINT/SIGTERM handling is idempotent, closes the HTTP
listener, then disconnects MongoDB. `server/src/app.js` has no DB startup side
effect.

Existing models are only User and RefreshToken. User fields include name,
email, password hash, token version, account status, last login, and timestamps.
RefreshToken stores the owning user, unique hash, family, token version at
issuance, expiry (TTL index), revocation time, and creation timestamp.

Configuration variable names in `server/.env.example`:

- `NODE_ENV`
- `PORT`
- `LOG_LEVEL`
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL_DAYS`
- `BCRYPT_COST`
- `CLIENT_ORIGIN`

The client example has `VITE_APP_NAME`; client-side `VITE_*` values are public
and must not contain secrets. In production, validation requires a MongoDB URI,
a non-placeholder JWT secret of at least 32 characters, and a valid
`CLIENT_ORIGIN`. The access TTL is constrained to `15m`, refresh TTL to 7 days,
and bcrypt cost to 10–14 (default 12); test mode supplies isolated test values
and lower bcrypt cost.

Copy the example only when creating a missing local env file; never overwrite
an existing `.env`. Generate local secrets independently and never paste them
into chat, this handoff, or source control. `server/.env` was confirmed present
and Git-ignored; its contents were not read or included.

## 9. Testing

Commands from repository root:

```powershell
npm ci --include=optional
npm run dev
npm run dev:server
npm run lint
npm run format:check
npm run build
npm test
```

`npm run dev:server` requires a valid local `server/.env` and reachable MongoDB.
The default test run isolates dotenv configuration and does not require
MongoDB. The real MongoDB authentication suite is opt-in:

```powershell
$env:RESOLVEHQ_MONGODB_INTEGRATION = '1'
npm test
```

It connects only to `127.0.0.1:27017`, creates a unique per-run database, and
drops that database during teardown. It does not use `MONGODB_URI` from the
developer environment. GitHub Actions maps its MongoDB service to that local
address and sets `RESOLVEHQ_MONGODB_INTEGRATION=1` for the test step.

Current test files:

- `server/tests/integration/health.test.js`
- `server/tests/integration/auth.test.js`
- `server/tests/integration/auth.mongodb.test.js`
- `server/tests/unit/auth-models.test.js`
- `server/tests/unit/auth-rate-limit.test.js`
- `server/tests/unit/db.test.js`
- `server/tests/unit/env.test.js`
- `server/tests/unit/server.test.js`

The auth Supertest suite covers normalized registration, duplicate email,
password hashing/validation, login and generic invalid credentials, access
token rejection cases, refresh rotation/reuse, logout, and logout-all. It mocks
both persistence models. `auth.mongodb.test.js` runs the same auth flows against
real MongoDB records, including concurrent refresh/reuse and rejection of
logout-all without an Origin header. It creates a unique database on loopback
and drops that database during teardown; it does not accept a MongoDB URI from
the environment. Enable it explicitly in PowerShell with:

```powershell
$env:RESOLVEHQ_MONGODB_INTEGRATION = '1'
npm test
```

This requires a local MongoDB server listening at `127.0.0.1:27017`.

Local results on 2026-11-05: the full suite with MongoDB integration enabled
passed, 8 files / 37 tests; lint passed; workspace format check passed; Vite
production build passed; `git diff --check` passed. These are local checks, not
a GitHub-hosted CI run. The workflow is configured to run MongoDB integration
tests, but has not yet been observed on GitHub Actions. No Atlas or production
database was used.
A prior clean `npm ci --include=optional` attempt on Windows failed with
`EPERM` while replacing a Lightning CSS native binary held by an already-running
Vite process; a subsequent `npm install --include=optional` restored
dependencies. Retry a clean install after the binary is no longer in use.

## 10. Git history and working tree

- Branch: `main`
- Latest commit: `f9dffbb0169a470ca78d6f1076baf0635b6c0e5c` —
  `test: isolate environment configuration in unit tests`
- Earlier commits include the database foundation (`bef6f07`), CI optional
  dependency fix (`25453db`), and initial project foundation (`5e9b1c8`).
- Remote `origin`: `https://github.com/bikendra77/ResolveHQ.git`
- At handoff preparation: no staged changes; 12 tracked files modified and 14
  new/untracked files (including this handoff). Authentication work is not
  committed. Do not commit or push without the user's instruction.

Modified tracked files:

```text
.github/workflows/ci.yml
README.md
docs/architecture.md
package-lock.json
server/.env.example
server/package.json
server/src/app.js
server/src/config/env.js
server/src/config/logger.js
server/src/middleware/error-handler.js
server/src/utils/api-error.js
server/tests/unit/env.test.js
```

New/untracked files:

```text
server/src/middleware/authenticate.js
server/src/middleware/validate-body.js
server/src/modules/auth/auth.controller.js
server/src/modules/auth/auth.rate-limit.js
server/src/modules/auth/auth.routes.js
server/src/modules/auth/auth.schema.js
server/src/modules/auth/auth.service.js
server/src/modules/auth/models/refresh-token.model.js
server/src/modules/auth/models/user.model.js
server/tests/integration/auth.test.js
server/tests/integration/auth.mongodb.test.js
server/tests/unit/auth-models.test.js
server/tests/unit/auth-rate-limit.test.js
AI_HANDOFF.md
```

The two dotenv test-isolation mocks are present in
`server/tests/unit/db.test.js` and `server/tests/unit/env.test.js`. The former
is already committed in the latest commit; the latter is part of the modified
working-tree file.

CI is defined in `.github/workflows/ci.yml`: Ubuntu, Node 22, root
`npm ci --include=optional`, lint, format check, build, and tests. Do not claim
the current uncommitted auth changes passed GitHub Actions until a new workflow
run against their commit succeeds.

## 11. Known issues and attention items

1. Confirm the updated CI workflow completes on GitHub Actions; local checks do
   not verify the hosted runner or service-container startup.
2. Individual logout does not immediately invalidate already-issued access
   tokens; they remain valid until their 15-minute expiry.
3. Add frontend authentication before claiming end-to-end sign-in or persistent
   browser sessions.
4. In-memory rate limiting is not distributed across API instances. Plan a
   shared store and configure trusted proxy behavior before multi-instance
   deployment.
5. The blueprint's hardening checklist includes Helmet, CORS allowlisting,
   sanitization, and additional tests. These are not fully implemented.
6. Previously reported npm audit output had five moderate findings; it was not
   re-audited for this handoff. Review advisories deliberately; do not use
   `npm audit fix --force`.
7. A clean Windows install previously encountered a locked native dependency
   file. Avoid killing unknown processes; retry once the active dev server has
   released it.

## 12. Development rules

- Treat the architecture PDF as source of truth; keep documentation honest
  about implemented versus planned behavior.
- Preserve the client/server separation, modular-monolith layout, and root npm
  workspace with one authoritative lockfile.
- Keep ES modules and current lint/format patterns.
- Keep `app.js` independent from database startup so HTTP tests can import it.
- Keep `/healthz` short and free of database state, credentials, or internals.
- Never commit `.env`, secrets, credentials, `node_modules`, or build output.
- Do not add plaintext passwords or refresh tokens to storage or logs; do not
  return password hashes or refresh tokens in JSON.
- Add tests for behavior, especially authorization, tenant scope, and error
  paths. Use an isolated database for real persistence integration tests.
- Do not implement unrelated features, upgrade dependencies without reason,
  force-fix audits, or claim live services/CI passed without verification.
