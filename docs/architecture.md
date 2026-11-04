# ResolveHQ foundation

The current implementation is a separated client/server foundation. The server exposes only its operational health check; product routes, database access, and domain modules are future work.

```mermaid
flowchart LR
  Browser --> Client["client: React + Vite + Tailwind"]
  Client -. "Development proxy for /api" .-> App["server/src/app.js: Express 5"]
  Startup["server/src/server.js: validated config + logger"] --> App
  App --> Health["GET /healthz"]
  App -. "Future: /api/v1 route modules" .-> Modules["Controllers and services"]
```
