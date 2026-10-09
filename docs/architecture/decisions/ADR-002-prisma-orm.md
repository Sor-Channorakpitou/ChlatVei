# ADR-002: Prisma as ORM and migration tool

**Status:** Accepted · 2026-10-08

## Context
The spec requires PostgreSQL, ORM-level SQL-injection protection, and version-controlled migrations (spec §21, rule 14). The main NestJS options are TypeORM and Prisma.

## Decision
Use **Prisma**: `backend/prisma/schema.prisma` is the single schema definition, and `prisma migrate` generates SQL migrations committed under `backend/prisma/migrations/`.

## Rationale
- Generated, fully typed client: query results match the schema, which catches errors at compile time.
- Migrations are plain SQL files, readable in review, and they can hold hand-written additions (for example, `CHECK` constraints, generated `tsvector`, and audit-table grants).
- Parameterized queries by default. Raw SQL requires tagged templates.

## Consequences
- ➖ Some features (generated columns, partial indexes, `CHECK`) need hand-edited migration SQL. That's acceptable and documented in migration comments.
- ➖ Polymorphic `entity_type/entity_id` (in `verifications`, `audit_logs`) has no FK enforcement; integrity is enforced in the service layer and covered by tests.
