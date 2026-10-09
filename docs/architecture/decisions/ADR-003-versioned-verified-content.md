# ADR-003: Per-item content versioning; only VERIFIED rows are public

**Status:** Accepted · 2026-10-08

## Context
Spec §7–§8 requires that public information never auto-publishes, verified information is never silently overwritten, and provenance and history are kept. Phase 2 showed that facts come one by one from different sources, in different languages, and with gaps.

## Options considered
1. **Whole-service versions** (a snapshot of the entire service per version). Simple to read, but one fee change forces re-reviewing everything, and per-fact provenance is awkward.
2. **Per-item rows with a status and a `supersedes_id` chain.** ← chosen
3. **Event sourcing.** Full history, but too complex for the MVP.

## Decision
Each content table (`requirements`, `service_steps`, `fees`, `processing_times`, `service_locations`) carries a status, provenance, and `supersedes_id`. Editing verified content creates a new `PENDING` row. Approving it marks the old row `OUTDATED` in the same transaction and writes `verifications`, `change_records`, and `audit_logs`. Public queries filter `status = VERIFIED`.

## Consequences
- ➕ Admins review exactly what changed, fact by fact, with evidence next to each fact.
- ➕ The same model serves manual edits, CSV imports, and ML extractions (`origin`).
- ➕ Matches the Phase 2 annotation format, so the import is direct.
- ➖ Five tables share columns. A shared Prisma field block (documented convention) and a generic `ContentRepository` helper prevent drift.
- ➖ Ordering (`position`) must be handled when a step is superseded: the new row inherits the old row's position.
