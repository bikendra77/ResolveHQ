# ResolveHQ foundation

The current implementation is a separated client/server foundation. The server connects to MongoDB before accepting requests and exposes an initial authentication module plus its operational health check. Organizations, product routes, and domain modules are future work.

```mermaid
flowchart LR
  Browser --> Client["client: React + Vite + Tailwind"]
  Client -. "Development proxy for /api" .-> App["server/src/app.js: Express 5"]
  Startup["server/src/server.js: validated config + logger"] --> Database["Mongoose connection"]
  Startup --> App
  App --> Health["GET /healthz"]
  App --> Auth["/api/v1/auth: register, login, refresh, logout, logout-all, me"]
  App -. "Future: /api/v1 route modules" .-> Modules["Controllers and services"]
```
