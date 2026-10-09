# Phase 3: Software Architecture

| Doc | Contents |
|---|---|
| [01_system_architecture.md](01_system_architecture.md) | Components, responsibilities, request flows, deployment |
| [02_data_model.md](02_data_model.md) | ERD, tables, the verification and versioning model |
| [03_api_spec.md](03_api_spec.md) | REST conventions, endpoints, errors, pagination |
| [04_auth_and_roles.md](04_auth_and_roles.md) | Authentication, authorization, security controls |
| [decisions/](decisions/) | Architecture Decision Records (ADRs) |

## Decisions

| ADR | Decision |
|---|---|
| [001](decisions/ADR-001-modular-monolith.md) | Modular NestJS monolith plus a separate Python ML service |
| [002](decisions/ADR-002-prisma-orm.md) | Prisma as ORM and migration tool |
| [003](decisions/ADR-003-versioned-verified-content.md) | Content is versioned per item; only `VERIFIED` rows are public |
| [004](decisions/ADR-004-jwt-auth.md) | Short-lived JWT access token and rotating refresh token in an httpOnly cookie |
| [005](decisions/ADR-005-search.md) | Search starts with PostgreSQL; ML similarity is added behind the same endpoint in Phase 7 |

## Design drivers (from the spec and Phase 1–2 findings)

1. **Trust over coverage.** Nothing becomes public without admin verification (spec §7, §8). Verified content is never overwritten.
2. **Provenance per fact.** Every requirement, fee, step, or location links to a source snapshot and verbatim evidence. This is the same model as the Phase 2 annotations.
3. **Unknown ≠ none.** Official sources often omit fields, especially processing time (Phase 2, finding F2). The model records "checked, not stated" explicitly.
4. **Khmer first.** Every citizen-facing text has `km` and `en` columns. Khmer is required and English is optional (Phase 2, finding F3).
5. **The application must work without ML.** ML features degrade gracefully when the ML service is down (spec §30, Phase 5).
