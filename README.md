# ResolveHQ

ResolveHQ is an early-stage project-management and issue-tracking application.
The checked-in product includes authentication and the first organization
onboarding foundation: a React client, an Express API, and MongoDB-backed
account, session, organization, and membership workflows. Projects, tasks,
issues, and collaboration features remain planned.

The canonical project root is the directory containing this `README.md`,
`package.json`, `.git`, `client/`, and `server/`. Open this directory in your
editor and run npm commands here; there is no second project directory inside
it.

## Current status

| Area                                                                           | Status                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Client authentication screens, protected `/app` shell, and session restoration | Implemented; mocked frontend tests passed                                |
| Authentication API and MongoDB persistence                                     | Implemented; mocked HTTP and MongoDB integration suites passed locally   |
| Organization listing, atomic creation, and membership-scoped detail            | Implemented; transaction behavior tested with mocks                      |
| Authenticated onboarding for users without an organization                     | Implemented; mocked frontend tests cover validation and submission       |
| Health endpoint, environment validation, logging, and database lifecycle       | Implemented; server tests passed                                         |
| Projects, tasks, issue tracking, and team collaboration                        | Not implemented                                                          |
| Full browser authentication flow, production deployment, and hosted CI        | Not verified; local health/auth proxy smoke checks passed                 |

Passing tests do not establish deployment readiness. See [AI_HANDOFF.md](./AI_HANDOFF.md)
for the current validation notes and known limitations.

## Technology

- **Client:** React 19, Vite 7, Tailwind CSS 4
- **API:** Node.js 22+, Express 5, Mongoose 9, MongoDB
- **Authentication and validation:** JWT, bcrypt, Zod, `express-rate-limit`
- **Quality and tests:** Vitest, Supertest, ESLint, Prettier
- **Repository layout:** npm workspaces (`client` and `server`)

See [docs/architecture.md](./docs/architecture.md) for the implemented
architecture and session flow, and [docs/api.md](./docs/api.md) for the current
HTTP contract.

Organization creation requires MongoDB transactions. The configured MongoDB
server must be a replica set or sharded cluster; a standalone server returns a
clear `503 TRANSACTIONS_UNAVAILABLE` response for organization creation. The
development API does not silently fall back to nontransactional writes.

## Prerequisites

- Node.js 22 or newer and npm
- MongoDB running locally, or a MongoDB URI reachable by the server

## Install and run locally

From the canonical project root, install dependencies:

```powershell
npm install
```

Create `server/.env` only if it does not already exist. Edit it to set a new
random `JWT_ACCESS_SECRET` of at least 32 characters and a reachable
`MONGODB_URI`. Never overwrite a populated `.env` file or commit it. The
server waits for MongoDB before it starts listening:

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

Start the frontend and backend together:

```powershell
npm run dev
```

The combined command runs the API in normal (non-watch) mode so a configuration
or database startup failure stops both processes instead of leaving a watcher
idle. Restart it after server changes. For API watch mode, run the two
independent commands in separate terminals:

```powershell
npm run dev:client
npm run dev:server
```

The API listens on port `4000` by default; Vite proxies `/api` and `/healthz`
to it. The combined launcher chooses an available client port starting at
`5173` and sets the matching API origin for that run, preserving auth origin
checks when the default port is busy. When starting the client and API
independently, set `CLIENT_ORIGIN` in `server/.env` to the exact Vite origin.
The health endpoint returns a basic process response and does not report
database readiness.

Optional client settings are in `client/.env.example`: `VITE_APP_NAME` and
`VITE_API_BASE_URL` (defaults to `/api/v1`). Values prefixed with `VITE_` are
bundled into the browser and must not contain secrets. Never commit or
overwrite a populated `.env` file.

## Commands

Run these from the repository root:

| Command                 | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start frontend and backend together     |
| `npm run dev:client`    | Start the Vite client independently     |
| `npm run dev:server`    | Start the API with Node watch mode       |
| `npm run start:server`  | Start the API without watch mode         |
| `npm run build`         | Create the client production build      |
| `npm run lint`          | Lint client and server workspaces       |
| `npm run format`        | Format client and server workspace files |
| `npm run format:check`  | Check workspace formatting              |
| `npm test`              | Run client and server Vitest suites     |

The default test run does not require MongoDB. To include the opt-in
MongoDB-backed authentication integration suite, start MongoDB on
`127.0.0.1:27017` and run in PowerShell:

```powershell
$env:RESOLVEHQ_MONGODB_INTEGRATION = '1'
npm test
```

That suite creates and drops its own uniquely named local test database; it
does not use the `MONGODB_URI` in `server/.env`. GitHub Actions configures a
MongoDB service and enables the suite.

## Troubleshooting

- **`ENOENT` for `package.json`:** open the canonical root described above and
  run npm there.
- **Vite reports `ECONNREFUSED` for `/api` or `/healthz`:** make sure
  `npm run dev` is running and the server has connected to MongoDB. Check that
  port `4000` is available and that `MONGODB_URI` points to a reachable
  MongoDB instance.
- **Server configuration error:** check the variable names reported in the
  error against `server/.env.example`. The application does not print secret
  values in configuration errors.
- **Organization creation reports `TRANSACTIONS_UNAVAILABLE`:** use a
  transaction-capable MongoDB replica set or sharded deployment. A standalone
  MongoDB server cannot atomically create an organization and its Owner
  membership; do not enable a nontransactional fallback.
- **Port conflicts:** stop the process using the port or update the API `PORT`
  and matching Vite proxy target in `client/vite.config.js`. If Vite selects a
  different frontend port while running processes independently, update
  `CLIENT_ORIGIN` in `server/.env` to that exact origin.

## Security notes

The API hashes passwords with bcrypt and stores only hashes of opaque refresh
tokens. Access JWTs expire after 15 minutes; refresh tokens rotate and are
delivered in a Secure, HttpOnly, SameSite=Strict cookie. The browser keeps
access tokens in memory. Authentication routes validate request bodies, use
rate limits, and redact sensitive fields from structured logs.

The rate-limit store is in-memory and is not shared across instances. The
application does not currently configure a production CORS allowlist or
deployment reverse proxy. Production deployment, multi-instance operation,
and the full security-hardening checklist remain unverified. Keep the client
and API same-origin behind a correctly configured proxy, and set
`CLIENT_ORIGIN` to the exact browser origin.
