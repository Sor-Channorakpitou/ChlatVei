# ADR-001: Modular monolith plus a separate ML service

**Status:** Accepted · 2026-10-08

## Context
ChlatVei needs authentication, a verification workflow, checklists, feedback, and analytics, plus ML features written in Python. The team is small and the MVP covers 10–20 services (spec §5, §10).

## Decision
- One **NestJS backend** organized into feature modules (`auth`, `services`, `content`, `sources`, `verification`, `feedback`, `checklists`, `analytics`, `audit`, `ml`).
- One **FastAPI ML service**, kept separate because it has a different runtime and dependencies.
- Both share nothing but HTTP. Only the backend touches the database.

## Consequences
- ➕ One deployable for business logic; transactions across modules (approve + change record + audit) stay simple.
- ➕ ML can be developed, tested, and versioned independently, and the app works when it is down.
- ➖ Module boundaries depend on discipline rather than network isolation. Mitigated by code review and keeping cross-module access limited to exported services.
- Revisit if a module needs independent scaling (unlikely at MVP scale).
