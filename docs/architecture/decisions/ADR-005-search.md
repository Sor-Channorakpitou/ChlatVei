# ADR-005: Search in PostgreSQL first, ML similarity later behind the same endpoint

**Status:** Accepted · 2026-10-08

## Context
Users don't know official service names (spec §14), and written Khmer has no spaces between words, so word-based full-text search tokenizes Khmer poorly (Phase 1 literature review). RQ4 needs a keyword baseline to compare against.

## Decision
- **Phase 4 (baseline):** `GET /api/search` uses PostgreSQL:
  - `pg_trgm` trigram similarity on Khmer and English names, summaries, and requirement text. Character trigrams don't need word segmentation.
  - `tsvector` full-text search for English.
  - Results are merged by score. This is the **keyword baseline** for RQ4.
- **Phase 7:** the backend also calls the ML service's `/search/similar` (TF-IDF character n-grams, optionally embeddings) and merges or replaces the ranking according to the Phase 6 evaluation results. The response tags each hit with `matchedBy`.
- No Elasticsearch or OpenSearch for the MVP; it isn't needed for about 20 services.

## Consequences
- ➕ No extra infrastructure; search works without ML.
- ➕ A clean A/B comparison for RQ4: same endpoint, same evaluation set, different ranker.
- ➖ Trigram ranking on Khmer is a heuristic. Its quality is measured in Phase 6, not assumed.
