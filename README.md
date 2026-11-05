# ResolveHQ

ResolveHQ is an early-stage project-management and issue-tracking application.
The checked-in product is currently a working authentication foundation: a
React client, an Express API, and MongoDB-backed account/session persistence.
Organizations, projects, tasks, issues, and collaboration features are planned,
not implemented.

## Current status

| Area                                                                           | Status                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Client authentication screens, protected `/app` shell, and session restoration | Implemented; mocked frontend tests passed                                |
| Authentication API and MongoDB persistence                                     | Implemented; mocked HTTP tests passed; MongoDB suite skipped in this run |
| Health endpoint, environment validation, logging, and database lifecycle       | Implemented; server tests passed                                         |
| Organizations, projects, tasks, issue tracking, and team collaboration         | Not implemented                                                          |
| Live browser-to-API flow, production deployment, and hosted CI result          | Not verified                                                             |

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

## Prerequisites

- Node.js 22 or newer and npm
- MongoDB running locally, or a MongoDB URI reachable by the server

## Install and run locally

From the repository root, install dependencies:

```powershell
npm ci --include=optional
```

In the first terminal, start the Vite client:

```powershell
npm run dev
```

In a second terminal, create the server environment file if it does not exist,
then start the API:

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

Edit `server/.env` before starting: set `JWT_ACCESS_SECRET` to a new random
secret of at least 32 characters and set `MONGODB_URI` to your MongoDB
connection. Then run:

```powershell
npm run dev:server
```

The API connects to MongoDB before listening on port `4000` by default. The
Vite development server proxies `/api` to `http://localhost:4000`. The
`/healthz` endpoint returns a basic process response; it does not report
database readiness.

Optional client settings are in `client/.env.example`: `VITE_APP_NAME` and
`VITE_API_BASE_URL` (defaults to `/api/v1`). Values prefixed with `VITE_` are
bundled into the browser and must not contain secrets. Never commit or
overwrite a populated `.env` file.

## Commands

Run these from the repository root:

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the Vite client                    |
| `npm run dev:server`   | Start the API with Node watch mode       |
| `npm run start:server` | Start the API without watch mode         |
| `npm run build`        | Create the client production build       |
| `npm run lint`         | Lint client and server workspaces        |
| `npm run format`       | Format client and server workspace files |
| `npm run format:check` | Check workspace formatting               |
| `npm test`             | Run client and server Vitest suites      |

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
