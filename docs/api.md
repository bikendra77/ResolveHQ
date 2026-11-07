# HTTP API (implemented state)

The API is served by the Express application. Its current routes are
`GET /healthz`, authentication endpoints, and the organization endpoints listed
below. Project, task, issue, and collaboration endpoints are not implemented.

The local Vite server proxies `/api` and `/healthz` to
`http://localhost:4000`; the API base path used by the client defaults to
`/api/v1`. From the Vite origin, `GET /healthz` can therefore be used to check
that the API process is reachable (it does not check MongoDB readiness).
Unless noted otherwise, JSON responses use the shapes below. Authenticated endpoints require an
`Authorization: Bearer <access-token>` header. Cookie-based requests require
`credentials: include`.

## Health

| Method and path | Auth | Success                  |
| --------------- | ---- | ------------------------ |
| `GET /healthz`  | No   | `200 { "status": "ok" }` |

The response includes an `X-Request-Id` header. The endpoint does not query
MongoDB and should not be interpreted as a readiness check.

## Authentication

| Method and path                | Auth / request                                                       | Success                        |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------ |
| `POST /api/v1/auth/register`   | JSON: `name`, `email`, `password`                                    | `201` session response         |
| `POST /api/v1/auth/login`      | JSON: `email`, `password`                                            | `200` session response         |
| `POST /api/v1/auth/refresh`    | Refresh cookie and exact allowed `Origin`; no JSON body              | `200` rotated session response |
| `POST /api/v1/auth/logout`     | Refresh cookie (if present) and exact allowed `Origin`; no JSON body | `204`                          |
| `POST /api/v1/auth/logout-all` | Bearer access token and exact allowed `Origin`; no JSON body         | `204`                          |
| `GET /api/v1/auth/me`          | Bearer access token                                                  | `200` public profile           |

### Registration and login

Registration accepts only the following fields:

```json
{
  "name": "Alex Example",
  "email": "alex@example.com",
  "password": "a sufficiently long password"
}
```

The name is trimmed and must contain 1–80 characters. The email is validated,
trimmed, and lowercased. Registration passwords must be 10–72 UTF-8 bytes;
login passwords must be 1–72 UTF-8 bytes. Unknown request fields are rejected.
Duplicate email returns `409 CONFLICT`. Invalid input returns `422
VALIDATION_FAILED`, including a `details` array with field paths and messages.
Invalid login credentials return `401 INVALID_CREDENTIALS` with the same
message for unknown accounts and incorrect passwords.

A successful registration or login sets the refresh cookie and returns:

```json
{
  "data": {
    "user": {
      "id": "MongoDB object id",
      "name": "Alex Example",
      "email": "alex@example.com"
    },
    "accessToken": "short-lived JWT"
  }
}
```

The API does not include password hashes or refresh-token values in the JSON
response. Do not persist the access token in browser storage; the current client
keeps it in memory.

### Refresh and logout

The cookie is named `resolvehq_refresh`; it is Secure, HttpOnly,
SameSite=Strict, scoped to `/api/v1/auth`, and has a seven-day lifetime. The
client cannot read it with JavaScript. Refresh rotates the token and replaces
the cookie. Missing, invalid, expired, revoked, or replayed refresh tokens are
rejected with `401 INVALID_TOKEN`; a rotated-token replay also invalidates the
token family.

Refresh, logout, and logout-all compare the request `Origin` exactly with
`CLIENT_ORIGIN`. A mismatch or missing origin returns `403 FORBIDDEN`. Logout
revokes the presented refresh token, clears the cookie, and returns no body.
Already-issued access JWTs can remain valid until their 15-minute expiry.
Logout-all increments the user's token version, revokes refresh tokens,
clears the cookie, and invalidates existing access JWTs.

### Current user

`GET /api/v1/auth/me` returns only the authenticated user's public profile:

```json
{
  "data": {
    "user": {
      "id": "MongoDB object id",
      "name": "Alex Example",
      "email": "alex@example.com"
    }
  }
}
```

The endpoint verifies the JWT and checks the user's active status and token
version. Missing, invalid, or expired access tokens return `401`.

## Organizations

All organization endpoints require an authenticated access token. Organization
creation derives its creator from the authenticated user; request bodies cannot
set the creator, organization identifier, or membership role.

| Method and path                                     | Request                         | Success                              |
| --------------------------------------------------- | ------------------------------- | ------------------------------------ |
| `GET /api/v1/organizations`                         | No body                         | `200` caller's organizations         |
| `POST /api/v1/organizations`                        | JSON: `name`                    | `201` organization; caller is Owner  |
| `GET /api/v1/organizations/:organizationId`         | MongoDB organization ID in path | `200` organization and caller role   |
| `GET /api/v1/organizations/:organizationId/members` | Organization ID in path         | `200` organization members and roles |

`POST /api/v1/organizations` accepts a trimmed, non-empty name of at most 80
characters and rejects unknown fields. Slugs are generated from the name in
lowercase URL-safe form; collisions receive a random suffix and are protected
by the database's unique slug index. The endpoint creates the Organization and
Owner Membership inside one MongoDB transaction. It returns
`503 TRANSACTIONS_UNAVAILABLE` if the server is disconnected or does not
support transactions; there is no nontransactional fallback.

The list endpoint returns only organizations found through the authenticated
user's Membership records. The detail endpoint first checks Membership using
both the authenticated user ID and the path organization ID. Invalid IDs and
organizations without a matching membership return `404 NOT_FOUND`, avoiding
disclosure of inaccessible tenant records.

Successful organization responses use this shape:

```json
{
  "data": {
    "organization": {
      "id": "MongoDB object id",
      "name": "Acme Team",
      "slug": "acme-team",
      "role": "owner",
      "createdAt": "ISO date",
      "updatedAt": "ISO date"
    }
  }
}
```

The list response contains an `organizations` array with the same item shape.
Memberships support multiple organizations; this API does not impose a
one-organization-per-user restriction.

The members endpoint requires membership in the requested organization; users
outside that tenant receive `404 NOT_FOUND`. All four organization roles may
list its members. The response includes each member's user ID, name, email,
role, and membership creation time as `joinedAt`.

```json
{
  "data": {
    "members": [
      {
        "id": "MongoDB user ID",
        "name": "Alex Example",
        "email": "alex@example.com",
        "role": "member",
        "joinedAt": "ISO date"
      }
    ]
  }
}
```

## Errors and limits

Errors use a common envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "requestId": "request identifier",
    "details": [{ "path": "email", "message": "Invalid email" }]
  }
}
```

`details` is included when applicable. Malformed JSON returns `400
BAD_REQUEST`; unmatched routes return `404`; unexpected server failures return
`500 INTERNAL`. Auth rate limits return `429 RATE_LIMITED` with a
`Retry-After` header:

- Registration: 5 requests per 15 minutes.
- Login: 10 requests per IP and 10 per normalized email per 15 minutes.
- Refresh: 30 requests per 15 minutes.

The limits use in-memory stores; they are not coordinated across API instances.
Test mode uses elevated limits. The API does not currently document a
distributed rate-limit store or a production CORS configuration.
