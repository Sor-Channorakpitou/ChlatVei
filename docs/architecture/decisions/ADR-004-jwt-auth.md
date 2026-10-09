# ADR-004: JWT access token plus rotating refresh token

**Status:** Accepted · 2026-10-08

## Context
An Angular single-page app (ADR-006) talks to a REST API. Requirements: registration and login, password hashing, RBAC, and protection of admin endpoints (spec §20).

## Decision
- 15-minute JWT access token, held in memory by the client and sent as a Bearer header.
- 7-day opaque refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/auth`. It is stored hashed, rotated on every use, and reuse revokes the whole token family.
- argon2id password hashing.

## Alternatives
- **Server sessions in a cookie:** simple and revocable, but every API call becomes cookie-authenticated, so CSRF protection is needed everywhere.
- **Long-lived JWT in localStorage:** rejected because XSS could steal the token and it can't be revoked.

## Consequences
- ➕ Stateless checks on normal requests; CSRF exposure is limited to the refresh endpoint, which `SameSite=Strict` protects.
- ➖ A role change takes effect within at most 15 minutes for an existing access token. Acceptable; refresh tokens are revoked immediately.
