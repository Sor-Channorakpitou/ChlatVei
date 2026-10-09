# Security Review (Phase 9)

Reviewed on 2026-10-09 against spec §21 and [04_auth_and_roles.md](../architecture/04_auth_and_roles.md).

## What ChlatVei protects

| Asset | Why it matters |
|---|---|
| **Published service information** | Wrong fees or documents mislead citizens. Only admins can change it, and only through review (ADR-003) |
| **Admin accounts** | An attacker with admin access could publish false information |
| **Citizen accounts and checklists** | Personal, though low sensitivity (no ID numbers are collected) |
| **Feedback** | Must stay anonymous to admins |

## Findings and fixes

| # | Finding | Severity | Fix | Proof |
|---|---|---|---|---|
| 1 | **Spoofable client IP.** The backend trusted `X-Forwarded-For` even without a proxy, so a client could fake its IP on every request and get around the login rate limit | High | The proxy is trusted only when `TRUST_PROXY=true`, which is set only behind nginx in Docker | `bootstrap.ts`; documented in `.env.example` |
| 2 | **No per-account brute-force protection.** The IP limit (5/min) can be spread across many IPs | Medium | 10 failed sign-ins in a row lock the account for 15 minutes (`429`). Even the correct password is refused during the lock, and a successful sign-in resets the counter. Migration `20261009000000_account_lockout` | `auth.e2e-spec.ts` "locks an account…" |
| 3 | **JWT algorithm not pinned** | Low | Tokens are signed and verified as HS256 only; unsigned tokens are rejected | `auth.e2e-spec.ts` "rejects unsigned tokens" |
| 4 | **`%` and `_` acted as wildcards** in the keyword-search fallback. Not injectable, but `%%` matched every service | Low | User input is escaped before `ILIKE` | `workflow.e2e-spec.ts` (`%%` returns nothing) |
| 5 | **Vulnerable dependency:** `deepmerge-ts` < 8 (stack exhaustion), pulled in by Prisma's config loader. Reached only by Prisma's own config files, never by user input | Low in practice; reported as high | npm `overrides` pins `deepmerge-ts ^8`. `npm audit` now reports 0 | `npm audit --omit=dev` |
| 6 | **Vulnerable dependency:** `pytest` 8.3.4 (test-only tool) | Low | Upgraded to 9.0.3 in `ml-service` and `pipelines` | `pip-audit` |

## Controls verified (no change needed)

| Area | Status |
|---|---|
| **SQL injection** | All queries go through Prisma. The only two raw queries are parameterized tagged templates |
| **XSS** | Angular escapes all interpolation. There is no `innerHTML`, `bypassSecurityTrust…` or `eval`. Links shown to citizens come from admin-entered URLs validated as `http(s)` |
| **Authorization** | Every route requires login unless marked `@Public()`. A test finds **every** admin route automatically and checks for 401 (anonymous) and 403 (citizen) |
| **Secrets** | No `.env`, keys or credentials are tracked in git. The JWT secret must be at least 32 characters, or the server refuses to start |
| **Passwords** | argon2id; at least 8 characters; a list of common passwords is refused; the same error message for an unknown email and a wrong password |
| **Sessions** | Access token held only in browser memory; refresh token in an httpOnly, SameSite=Strict cookie, stored hashed, rotated on each use, with reuse detection |
| **Mass assignment** | Unknown request fields are rejected (`forbidNonWhitelisted`). Registration can't set a role |
| **Path traversal** | Extraction reads files only via source codes matching `^S\d+$` and sanitized file names under `DATA_DIR` |
| **Errors and logs** | No stack traces in responses. Logs hold the request id, path, status and timing, never request bodies, tokens or passwords |
| **Privacy** | Feedback stores no names, phone numbers or IPs, and admins never see who sent it |
| **Data integrity** | Database CHECK constraints for currency, ranges, checklist targets and Khmer text on public content; append-only audit log |
| **ML service** | Not public. Optional shared key (`ML_API_KEY`). Input sizes are bounded. It never writes to the database |
| **Frontend dependencies** | `npm audit`: 0 vulnerabilities |

## Remaining risks (accepted for the MVP)

| Risk | Why accepted / what would fix it |
|---|---|
| **The lockout message reveals that an account exists** (only after 10 failures on that email) | A common trade-off for usability. It could return the generic error instead, at the cost of confusing locked-out users |
| **An attacker could deliberately lock someone's account** by failing 10 times | The lock lasts only 15 minutes. CAPTCHA or email unlock would fix this, but needs email infrastructure |
| **No password change or reset yet** | Needs email delivery. Admins can deactivate a compromised account today |
| **Rate-limit counters live in memory,** per backend instance | Fine for one instance. Use Redis-backed throttling if the backend is scaled out |
| **Security headers on the frontend** (CSP and friends) | Added on the nginx server in Phase 10 |
| **One admin can approve their own edits** (`REQUIRE_DIFFERENT_APPROVER=false`) | Turn it on once there are at least two admins |

## How to re-run the checks

```bash
cd backend && npm audit --omit=dev && npm run test:e2e
cd frontend && npm audit --omit=dev
.venv/Scripts/pip-audit -r ml-service/requirements.txt
```
