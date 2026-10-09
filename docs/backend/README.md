# Backend Guide (Phase 4)

This guide explains how the ChlatVei API works and how to run it. Read it alongside:
- [Data model](../architecture/02_data_model.md): the tables and the verification model
- [API spec](../architecture/03_api_spec.md): every endpoint
- [Auth and roles](../architecture/04_auth_and_roles.md): login and permissions

## 1. Run it (about 5 minutes)

Prerequisites: Node 20+ (tested on 24), Docker Desktop.

```bash
# from the repo root
docker compose up -d postgres            # PostgreSQL 16 on localhost:55432

cd backend
cp .env.example .env                     # then set JWT_ACCESS_SECRET (command is in the file)
npm install
npx prisma migrate deploy                # create the tables
npm run seed                             # import the Phase 2 data (everything PENDING)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password-here' npm run create-admin
npm run start:dev                        # http://localhost:3000/api/health → {"status":"ok"}
```

> **Port 55432** is used because this machine already has a local PostgreSQL on 5432/5433.

### Tests

```bash
npm test             # unit tests (fast, no database)
npm run test:e2e     # end-to-end tests against the chlatvei_test database
npm run build        # production build; also type-checks everything
```

The e2e tests use a **separate database** (`chlatvei_test`). Before emptying any tables they check that the database name ends in `_test`, so they can never touch development data.

## 2. How a request flows

```text
HTTP request
  → RequestIdMiddleware   gives the request an id (X-Request-Id), logs method/path/status/ms
  → ThrottlerGuard        rate limit (100/min per IP; login/register 5/min; feedback 10/hour)
  → JwtAuthGuard          checks the Bearer token; every route needs one unless marked @Public()
  → RolesGuard            checks @Roles('ADMIN')
  → ValidationPipe        validates the body/query against the DTO class; unknown fields → 400
  → Controller            thin: reads params, calls the service
  → Service               business rules, Prisma queries, transactions, audit log
  → AllExceptionsFilter   turns any error into { error: { code, message, details?, requestId } }
```

"Secure by default": if you add a route and forget `@Public()`, it requires login. If you forget `@Roles('ADMIN')` on an admin route, the authorization test fails, because it finds admin routes automatically (see §6).

## 3. Code map

```text
backend/
├── prisma/
│   ├── schema.prisma            ← the database design (start here)
│   ├── migrations/              ← SQL actually applied; includes hand-written CHECK constraints
│   ├── seed.ts                  ← imports data/metadata + data/processed/annotations
│   └── init/                    ← creates chlatvei_test and chlatvei_shadow on first Docker start
├── scripts/create-admin.ts      ← the only way to create the first admin
├── src/
│   ├── main.ts / bootstrap.ts   ← server start; global pipes, filters, helmet, CORS
│   ├── app.module.ts            ← wires modules and the three global guards
│   ├── config/                  ← environment validation (the server refuses to start if misconfigured)
│   ├── common/                  ← guards, decorators, errors, pagination, runtime DTO validation
│   ├── prisma/  audit/          ← shared database client and audit-log writer
│   ├── auth/                    ← register, login, refresh rotation, logout, password hashing
│   ├── users/                   ← /users/me and admin user management
│   ├── services/                ← public catalogue, service detail, search, admin service CRUD
│   ├── content/                 ← ★ the 5 versioned content types (registry + create/edit rules)
│   ├── verification/            ← ★ review queue, approve / reject / mark outdated
│   ├── sources/                 ← sources, snapshots, verifying sources, linking to services
│   ├── checklists/              ← personal checklists
│   ├── feedback/                ← citizen feedback (privacy-minimal)
│   └── analytics/               ← dashboard numbers, Wilson intervals, audit-log viewer
└── test/                        ← e2e tests (auth, authorization sweep, full workflow)
```

The two ★ folders hold the core idea of the project. Read `content/content-types.ts` first: the five content types share one set of versioning rules, and the registry describes what differs between them.

## 4. The verification workflow, step by step

This is the heart of ChlatVei: **nothing becomes public without an admin approving it against an official source.**

```text
                       admin edits a VERIFIED row
                       (creates a new row with supersedesId)
                                   │
 create ──► PENDING ──► (UNDER_REVIEW) ──► approve ──► VERIFIED ──► (newer version approved) ──► OUTDATED
                │                                        │
                └──── reject (comment required) ──► REJECTED
                                                         └── mark outdated (comment required) ──► OUTDATED
```

**Approval is refused (HTTP 422) unless:**
1. the row has **Khmer text** (published content is always available in Khmer),
2. it cites a **source that an admin has verified**,
3. that source is **official** (tier T1 or T2; secondary T3 sources are never enough),
4. it has **evidence** (a quote from the source),
5. optionally, the approver is a **different admin** from the creator (`REQUIRE_DIFFERENT_APPROVER=true`).

**One approval transaction does all of this, or none of it:**
- the new row becomes `VERIFIED`;
- the row it replaces (if any) becomes `OUTDATED`. It is kept, never deleted or overwritten;
- a **change record** is written with the before and after values, which citizens can see under `/services/:slug/changes`;
- a **verification** record and an **audit log** entry are written;
- the service's `lastVerifiedAt` is updated.

**Concurrency:** status changes use conditional updates (`WHERE status = 'PENDING'`). If two admins act on the same item at the same moment, one wins and the other gets `409 Conflict`.

### Try it by hand

```bash
API=http://localhost:3000/api
TOKEN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-password-here"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')
AUTH="Authorization: Bearer $TOKEN"

curl -s "$API/admin/review?pageSize=5" -H "$AUTH"                         # the 36 imported facts, PENDING
curl -s "$API/sources?pageSize=3" -H "$AUTH"                               # find S001's id
curl -s -X POST $API/sources/<S001-id>/decision -H "$AUTH" -H 'content-type: application/json' -d '{"status":"VERIFIED"}'
curl -s -X PATCH $API/admin/content/requirements/<id> -H "$AUTH" -H 'content-type: application/json' -d '{"textKm":"…"}'
curl -s -X POST $API/admin/review/requirements/<id>/approve -H "$AUTH" -H 'content-type: application/json' -d '{}'
```

## 5. Rules worth knowing (and where they live)

| Rule | Where |
|---|---|
| Public endpoints return only `PUBLISHED` services and `VERIFIED` content | `services/services.service.ts` (`VERIFIED` filter on every query) |
| Editing verified content creates a new version | `content/content.service.ts` → `proposeReplacement` |
| Only one open proposal per verified item | same file (`409` otherwise) |
| Khmer text required to approve or publish | `verification.service.ts`, `services.service.ts`, plus DB `CHECK` constraints |
| Changing a verified source's URL or tier sends it back to `PENDING` | `sources/sources.ts` → `update` |
| Registration always creates `CITIZEN` | `auth/auth.service.ts`; the DTO has no `role` field, so sending one returns 400 |
| Admins can't change their own role or deactivate themselves | `users/users.service.ts` |
| Role change or deactivation ends all of that user's sessions | same file → `revokeAllForUser` |
| Reusing an old refresh token ends the whole session family | `auth/auth.service.ts` → `refresh` |
| Feedback stores no personal data, and admins don't see who sent it | `feedback/feedback.ts` |
| Checklist items keep their text even if the content later changes, and are flagged `contentChanged` | `checklists/checklists.ts` |
| Sorting only on whitelisted fields | `common/pagination.ts` → `parseSort` |

## 6. What the tests prove

| Test file | What it checks |
|---|---|
| `test/auth.e2e-spec.ts` | Register/login, argon2id hashes, no self-registration as admin, duplicate emails, weak passwords, same error for unknown email and wrong password, refresh rotation and **reuse detection**, logout |
| `test/authorization.e2e-spec.ts` | Finds **every** `@Roles('ADMIN')` route automatically and checks that anonymous callers get **401** and citizens get **403** on each. Role changes end sessions; admins can't demote themselves |
| `test/workflow.e2e-spec.ts` | The two spec flows (§22): *admin reviews → approves → information becomes public* and *citizen searches → views → creates a checklist → completes it*. Also versioning (old version kept as `OUTDATED`, before/after diff), approval refusals (no Khmer text, unverified source), rejected content can't be revived, checklist ownership, outdated content flagged on checklists, feedback and analytics, error format |
| `src/analytics/wilson.spec.ts` | Wilson interval maths against a reference value |
| `pipelines/tests/` (Python) | Every imported fact and Khmer service name is quoted verbatim from its source snapshot |

## 7. Search (baseline for RQ4)

`GET /api/search?q=` uses PostgreSQL trigram similarity (`pg_trgm`) on service names (Khmer and English) and verified requirement text, plus substring matches. Trigrams don't need word segmentation, which matters because written Khmer has no spaces between words.

**Known limitation, to measure in Phase 6:** an exact Khmer substring scores about 0.6 rather than 1.0, because PostgreSQL treats Khmer combining vowel signs as word boundaries. Exact substrings are therefore also matched with `ILIKE`. This search is the *baseline* that the Phase 6 ML search will be compared against.

## 8. Known gaps and next steps

- **Contact details** (hotline, office hours) from the Phase 2 data are not imported yet, because there is no contact table. They will probably become a `contact` channel on `service_locations`.
- **The review queue** is sorted and paginated in memory. That's fine for hundreds of pending items; it would need a SQL `UNION` view for many thousands.
- **The ML features** (`/admin/extraction-jobs`, `/admin/analytics/complexity`, and similarity in `/search`) are Phase 7.
- **Category names in Khmer** (seed file) are interface labels written for the prototype and should be checked by a native speaker.
- **Snapshots** point to files in `data/raw/`. In production they would live in object storage (Phase 10).
