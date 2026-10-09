# 04: Authentication, Authorization and Security

## Roles

| Capability | Anonymous | `CITIZEN` | `ADMIN` |
|---|:-:|:-:|:-:|
| Search and read published, verified services | ✅ | ✅ | ✅ |
| Submit feedback / report a problem | ✅ (rate-limited) | ✅ | ✅ |
| Own checklists | n/a | ✅ | ✅ |
| Create or edit services and content (creates `PENDING`) | ❌ | ❌ | ✅ |
| Approve / reject / mark outdated | ❌ | ❌ | ✅ |
| Manage sources, users; view feedback, analytics, audit log | ❌ | ❌ | ✅ |

**There is no self-service path to `ADMIN`.** Registration always creates `CITIZEN`. The first admin is created with a CLI seed command (`npm run create-admin`) that reads credentials from environment variables. Later admins are promoted by an existing admin, and the promotion is audit-logged.

**Four-eyes (optional, configurable):** with `REQUIRE_DIFFERENT_APPROVER=true`, an admin cannot approve a row they created. It is off by default because there may be only one admin early on, and it can be turned on once there are several.

## Authentication flow

```text
login ──► access token (JWT, 15 min, in memory on the client)
      └─► refresh token (random 256-bit, 7 days, httpOnly + Secure + SameSite=Strict cookie, path=/api/auth)

request ──► Authorization: Bearer <access>
401 ──► POST /api/auth/refresh (cookie) ──► new access + rotated refresh
```

- **Passwords:** argon2id (`argon2` package with default memory/time cost), at least 8 characters, and checked against a small common-password list.
- **Access token claims:** `sub` (user id), `role`, `iat`, `exp`. Signed HS256 with `JWT_ACCESS_SECRET`.
- **Refresh rotation and reuse detection:** each refresh issues a new token in the same `family_id` and revokes the old one. If a revoked token is presented again, the **whole family is revoked** and the user must log in again.
- **Role changes and deactivation** revoke all of the user's refresh tokens. The access token expires within 15 minutes.
- **Login errors are generic** ("invalid email or password") so the API doesn't reveal which emails exist.

## Authorization implementation (NestJS)

- A global `JwtAuthGuard` authenticates every route except those marked `@Public()`. Secure by default: forgetting a decorator closes a route rather than opening it.
- `RolesGuard` with `@Roles('ADMIN')` is applied at the **controller** level for all `/admin/*` controllers and for admin-only routes in shared controllers.
- **Ownership checks** (for example, checklists) happen in the service layer by querying with `where: { id, userId }`. A miss returns `404`.
- **Authorization tests (Phase 9):** every admin route is called as anonymous (expects 401) and as `CITIZEN` (expects 403). The route list is generated from Nest's router, so new admin routes are covered automatically.

## Security controls

| Control | Implementation |
|---|---|
| Input validation | DTOs with `class-validator`; `whitelist` + `forbidNonWhitelisted`; length limits on all strings |
| SQL injection | Prisma parameterized queries only; `$queryRaw` allowed only with tagged templates (lint rule) |
| Rate limiting | `@nestjs/throttler`: login/register 5/min/IP; feedback 10/hour/IP; global 100/min/IP |
| CORS | Allow-list from `CORS_ORIGINS`; credentials enabled only for those origins |
| Headers | `helmet` (CSP, HSTS in production, no `X-Powered-By`) |
| CSRF | Refresh cookie is `SameSite=Strict` and scoped to `/api/auth`; all other endpoints use Bearer tokens, not cookies |
| Errors | Global filter maps errors to the standard shape; stack traces are logged server-side only |
| Secrets | Environment variables only; `.env` git-ignored; `.env.example` documents the keys; CI secrets in GitHub Actions |
| Audit | Every admin write → `audit_logs` (actor, action, entity, IP) |
| Logs | Request id, route, status, latency; **never** passwords, tokens, or feedback text |
| Dependencies | `npm audit` / `pip-audit` in CI (Phase 9) |
| ML service | Not exposed publicly; reachable only on the Docker network |

## Configuration

`.env.example` (values are placeholders):

```dotenv
# backend
DATABASE_URL=postgresql://chlatvei:change-me@localhost:5432/chlatvei
JWT_ACCESS_SECRET=change-me-to-64-random-bytes
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
CORS_ORIGINS=http://localhost:5173
ML_SERVICE_URL=http://ml-service:8000
REQUIRE_DIFFERENT_APPROVER=false
ADMIN_EMAIL=
ADMIN_PASSWORD=
```
