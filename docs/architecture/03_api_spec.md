# 03: API Specification

Base path: `/api`. JSON only. All timestamps are ISO-8601 UTC.
Auth: `Authorization: Bearer <access token>` (see [04_auth_and_roles.md](04_auth_and_roles.md)).
Access legend: 🌐 public · 👤 any signed-in user · 🛡️ `ADMIN` only.

## Conventions

### Pagination, sorting, filtering
```
GET /api/services?page=1&pageSize=20&sort=-updatedAt&category=transport&q=passport
```
- `page` ≥ 1 (default 1); `pageSize` 1–100 (default 20).
- `sort`: a field name, with a `-` prefix for descending. Only whitelisted fields per endpoint.
- Filters are plain query params, validated per endpoint. Unknown params return `400`.

List response:
```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 }
}
```
Single resource: `{ "data": { ... } }`.

### Errors
Every error has the same shape:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [ { "field": "email", "issue": "must be an email" } ],
    "requestId": "b6f1c2..."
  }
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO validation, bad query params |
| 401 | `UNAUTHENTICATED` | Missing, invalid, or expired token |
| 403 | `FORBIDDEN` | Authenticated but role not allowed |
| 404 | `NOT_FOUND` | Resource missing, or not visible to the caller |
| 409 | `CONFLICT` | Unique violation, or approving a row whose base row already changed |
| 422 | `BUSINESS_RULE` | e.g. approving content without a verified T1/T2 source |
| 429 | `RATE_LIMITED` | Throttled |
| 503 | `DEPENDENCY_UNAVAILABLE` | ML service down, for endpoints with no fallback |
| 500 | `INTERNAL` | Anything else; no internal detail in the message |

### Language
Content fields come in pairs (`nameKm` / `nameEn`). The client chooses which to show; when English is missing, it shows Khmer. The API never machine-translates.

---

## Auth

| Method | Path | Access | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | 🌐 | `{email, password, displayName, preferredLanguage}` → creates a `CITIZEN` user. Rate-limited |
| POST | `/auth/login` | 🌐 | `{email, password}` → `{accessToken, user}` and sets the refresh cookie. Rate-limited |
| POST | `/auth/refresh` | 🌐 (cookie) | Rotates the refresh token → `{accessToken}` |
| POST | `/auth/logout` | 👤 | Revokes the refresh-token family and clears the cookie |
| GET | `/users/me` | 👤 | Current profile |
| PATCH | `/users/me` | 👤 | `{displayName?, preferredLanguage?}` |

## Public catalogue

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/categories` | 🌐 | |
| GET | `/services` | 🌐 | `q`, `category`, `page`, `pageSize`, `sort` (`name`, `-lastVerifiedAt`). Published services only |
| GET | `/services/:slug` | 🌐 | Full service detail (below) |
| GET | `/services/:slug/requirements` | 🌐 | `kind` filter |
| GET | `/services/:slug/steps` | 🌐 | |
| GET | `/services/:slug/changes` | 🌐 | Public change history (`change_records`) |
| GET | `/search?q=` | 🌐 | Ranked matches with `score` and `matchedBy` (`keyword` or `similarity`) |

`GET /services/:slug` response (abridged):
```json
{
  "data": {
    "slug": "driver_license_ab",
    "nameKm": "…", "nameEn": "Driver's license, Types A and B",
    "category": { "slug": "transport", "nameKm": "…", "nameEn": "Transport" },
    "lastVerifiedAt": "2026-10-20T03:12:00Z",
    "requirements": [
      { "id": "…", "kind": "DOCUMENT", "textKm": "…", "textEn": "National identity card",
        "appliesTo": "Driving test applicant", "source": { "code": "S001", "name": "Driver's License", "url": "https://mpwt.gov.kh/…" },
        "verifiedAt": "2026-10-20T03:12:00Z" }
    ],
    "steps": [ … ], "fees": [ … ], "processingTimes": [ … ], "locations": [ … ],
    "notStated": [ { "field": "PROCESSING_TIME", "appliesTo": null, "source": { "code": "S001" } } ],
    "sources": [ { "code": "S001", "name": "…", "url": "…", "tier": "T1", "lastCheckedAt": "…" } ],
    "complexity": { "score": 72, "modelVersion": "baseline-0.1", "factors": [ … ] }
  }
}
```
`complexity` is `null` until Phase 7. Only `VERIFIED` content appears.

## Checklists

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/checklists` | 👤 | Own checklists only |
| POST | `/checklists` | 👤 | `{serviceSlug}` → builds items from the service's verified documents and steps. `409` if one already exists |
| GET | `/checklists/:id` | 👤 (owner) | Includes `progress: {done, total}` and `contentChanged` flags |
| PATCH | `/checklists/:id/items/:itemId` | 👤 (owner) | `{isDone}` |
| DELETE | `/checklists/:id` | 👤 (owner) | |

Another user's checklist returns `404`, not `403`, so the API doesn't reveal that it exists.

## Feedback

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/feedback` | 🌐 (rate-limited) | `{serviceSlug, kind, rating?, difficulty?, foundNeeded?, outcome?, confusingStepId?, comment?}`. Links the user if signed in |
| GET | `/feedback` | 🛡️ | Filters: `service`, `kind`, `status`, `from`, `to` |
| PATCH | `/feedback/:id` | 🛡️ | `{status}` |

## Admin: services and content

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/admin/services` | 🛡️ | All statuses |
| POST | `/services` | 🛡️ | Creates a `DRAFT` service |
| PATCH | `/services/:id` | 🛡️ | Service metadata (names, category, publish status) |
| DELETE | `/services/:id` | 🛡️ | Soft delete → `ARCHIVED` |
| POST | `/admin/services/:id/:contentType` | 🛡️ | `contentType` ∈ `requirements`, `steps`, `fees`, `processing-times`, `locations`. Creates a `PENDING` row; `sourceId` + `evidence` required |
| PATCH | `/admin/content/:contentType/:id` | 🛡️ | On a `VERIFIED` row this **creates a new `PENDING` row** that supersedes it; on a `PENDING` row it edits in place |
| POST | `/admin/services/:id/gaps` | 🛡️ | Records "checked, not stated" |

## Admin: review (verification workflow)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/admin/review` | 🛡️ | Queue of `PENDING` / `UNDER_REVIEW` rows across content types. Filters: `service`, `origin`, `minConfidence`. Each item includes source, evidence, and the superseded row (for a diff) |
| POST | `/admin/review/:contentType/:id/approve` | 🛡️ | Transaction: row → `VERIFIED`; superseded row → `OUTDATED`; `verifications` + `change_records` + `audit_logs`; updates `services.last_verified_at`. `422` without a verified T1/T2 source |
| POST | `/admin/review/:contentType/:id/reject` | 🛡️ | `{comment}` required |
| POST | `/admin/content/:contentType/:id/mark-outdated` | 🛡️ | `{comment}` required |

## Admin: sources

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/sources` | 🛡️ | Filters: `status`, `tier`, `service` |
| POST | `/sources` | 🛡️ | Created as `PENDING` |
| PATCH | `/sources/:id` | 🛡️ | Metadata only |
| POST | `/sources/:id/verify` | 🛡️ | → `VERIFIED` (records a verification) |
| POST | `/sources/:id/snapshots` | 🛡️ | Registers a snapshot `{collectedAt, sha256, storagePath}` |
| PUT | `/services/:id/sources/:sourceId` | 🛡️ | `{relevance}`: link a source |
| DELETE | `/services/:id/sources/:sourceId` | 🛡️ | Unlink a source |

## Admin: extraction (Phase 7)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/admin/extraction-jobs` | 🛡️ | `{snapshotId, serviceId}` → `202` with the job |
| GET | `/admin/extraction-jobs/:id` | 🛡️ | Status and items proposed |

## Admin: users and analytics

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/admin/users` | 🛡️ | Filters: `role`, `q` |
| PATCH | `/admin/users/:id` | 🛡️ | `{role?, isActive?}`. An admin cannot demote or deactivate themselves (prevents lockout) |
| GET | `/admin/analytics/overview` | 🛡️ | Counts: services by status/category, sources by status, pending reviews, outdated items, feedback this period |
| GET | `/admin/analytics/feedback` | 🛡️ | Difficulty and rating by service, most-reported confusing steps (with Wilson CIs, RQ3) |
| GET | `/admin/analytics/complexity` | 🛡️ | Score distribution and top factors (Phase 7) |
| GET | `/admin/audit-logs` | 🛡️ | Filters: `actor`, `action`, `from`, `to` |

## Internal: ML service (not exposed publicly)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/health` | `{status, modelVersions}` |
| POST | `/extract` | `{text, language}` → `{serviceName, requirements[], steps[], fees[], processingTime, locations[], confidence, modelVersion}` |
| POST | `/predict-complexity` | `{features}` → `{score, factors[{name, contribution}], modelVersion}` |
| POST | `/search/similar` | `{query, candidates[{id, text}], topK}` → `{results[{id, score}], modelVersion}` |

The ML service is stateless: the backend sends it what it needs, and only the backend writes to the database.
