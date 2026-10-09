# Deployment Guide (Phase 10)

## What runs

```text
            internet
               │  :8080 (put TLS in front of this, see §5)
        ┌──────▼──────┐
        │  frontend   │  nginx: Angular PWA + security headers, proxies /api
        └──────┬──────┘
               │ internal network only
        ┌──────▼──────┐        ┌────────────┐
        │  backend    │───────►│ ml-service │  FastAPI, never published
        │  NestJS     │        └────────────┘
        └──────┬──────┘
        ┌──────▼──────┐
        │  postgres   │  data in the `pgdata` volume
        └─────────────┘
```

| Container | Image | Runs as | Health check |
|---|---|---|---|
| `frontend` | `nginx:1.27-alpine` + built app | nginx | `GET /` |
| `backend` | `node:22-alpine` | `node` (not root) | `GET /api/health` (also checks the database) |
| `ml-service` | `python:3.12-slim` | user `ml` (not root) | `GET /health` |
| `postgres` | `postgres:16-alpine` | postgres | `pg_isready` |

## 1. First start

```bash
cp .env.example .env
# Edit .env:
#   POSTGRES_PASSWORD  a long random password (set it BEFORE the first start; it is baked into the volume)
#   JWT_ACCESS_SECRET  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
#   ML_API_KEY         any long random string
#   PUBLIC_URL         the address citizens will use, e.g. https://chlatvei.example
docker compose up -d --build
docker compose ps          # wait until backend and frontend show (healthy)
```

- **Migrations:** the backend applies pending database migrations automatically every time it starts (`prisma migrate deploy`, which never drops data).
- **Safe failure:** if `JWT_ACCESS_SECRET` is missing or shorter than 32 characters, the backend **refuses to start**.

## 2. First admin and data

These run from your machine against the database container, which is published on `127.0.0.1:55432` only:

```bash
cd backend
DATABASE_URL=postgresql://chlatvei:<POSTGRES_PASSWORD>@localhost:55432/chlatvei npm run seed          # import Phase 2 data (all PENDING)
DATABASE_URL=… ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run create-admin
```

Then sign in on the website, open **Admin**, and follow the [admin guide](../admin-guide/README.md) to verify sources and approve content.

## 3. Updating

```bash
git pull
docker compose up -d --build     # rebuilds changed images; the backend migrates on start
```

On `main`, CI publishes the images to `ghcr.io/<owner>/chlatvei-{backend,frontend,ml-service}` tagged `latest` and with the commit SHA. A server can pull those instead of building. To roll back, start the previous SHA tag.

## 4. Backups

```bash
# Back up (daily, e.g. from cron), and keep copies off the server
docker compose exec -T postgres pg_dump -U chlatvei -Fc chlatvei > backup-$(date +%F).dump
# Restore into an empty database
docker compose exec -T postgres pg_restore -U chlatvei -d chlatvei --clean < backup-YYYY-MM-DD.dump
```

The raw source snapshots (`data/`) live in git, so the repository is their backup.

## 5. HTTPS (required in production)

The refresh cookie is marked `Secure` in production, so **sign-in only works over HTTPS** (browsers treat `http://localhost` as secure, which is why local testing works).

To run in production:
1. Put TLS in front of port 8080, for example a host nginx or Caddy with Let's Encrypt, or a cloud load balancer.
2. Add `Strict-Transport-Security` where TLS ends.
3. Set `PUBLIC_URL` to the `https://` address.

## 6. Monitoring and logs

| What | How |
|---|---|
| Is it up? | `docker compose ps` health status; external uptime check on `https://<site>/api/health` |
| Logs | `docker compose logs -f backend`: JSON lines with request id, method, path, status and duration (no bodies, tokens or passwords) |
| Tracing a user's error | Every error response includes a `requestId`, which matches the backend log line |
| ML service | `docker compose logs ml-service`. If it's down, search falls back to the database and the logs say so (`using fallback`) |
| Admin activity | **Admin → Dashboard**, plus the `audit_logs` table (`GET /api/admin/audit-logs`) |

## 7. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Steps |
|---|---|
| **backend** | `npm ci` → Prisma generate → type-check → unit tests → **end-to-end tests against a real PostgreSQL** → dependency audit |
| **frontend** | `npm ci` → unit tests → production build → dependency audit |
| **python** | ML-service and package tests → data pipeline and dataset-integrity tests |
| **docker** | Builds all three images (after the jobs above pass); on `main`, **publishes** them to GHCR |

Branch flow (spec §29): `feature/*` → PR into `development` → PR into `main` (release).

## 8. Checked locally (2026-10-09)

`docker compose up -d --build`, then:
- **API through nginx:** `GET /api/health` returns `{"status":"ok"}`.
- **App routes:** the app shell and a deep link (`/services/…`) both return 200.
- **Security headers present:** CSP, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options.
- **ML service:** reachable from the backend but **not** from the host.
- **Renders under the strict CSP:** styles and Khmer fonts load correctly (critical-CSS inlining is disabled because it relies on an inline `onload`, which CSP blocks).

Fixed while doing this: the frontend lock file, generated on Windows, lacked two Linux-only optional packages (`@emnapi/*`), so `npm ci` failed in Docker. They are now explicit dev dependencies.
