# ML Integration Guide (Phase 7)

Phase 7 connects the Phase 6 data-science work to the real application:

```text
Angular (browser) ──► NestJS backend ──► Python ML service (FastAPI, internal only)
                          │                   └─ chlatvei_ml package (Phase 6, tested)
                          ▼
                      PostgreSQL  (only the backend writes; the ML service is stateless)
```

| Feature | What the citizen or admin sees | Backend | ML endpoint | If ML is down |
|---|---|---|---|---|
| **Search** | Better results, especially for Khmer phrases | `GET /api/search` sends published services and their verified content as candidates | `POST /search/similar` | The database keyword search answers instead (`matchedBy: "keyword"`) |
| **Complexity** | A box on the service page: score out of 100, top reasons, and a clear "not official information" note | `POST /api/admin/services/:id/complexity` or `…/analytics/complexity/recompute` computes features from **verified** content and stores an `ml_predictions` row | `POST /predict-complexity` | `503 DEPENDENCY_UNAVAILABLE`; the last stored score stays visible |
| **Extraction** | New `EXTRACTED` items in the admin review queue, with confidence and verbatim evidence | `POST /api/admin/extraction-jobs {sourceId, serviceId}` reads the snapshot's extracted text and creates `PENDING` rows | `POST /extract` | The job is marked `FAILED` with the reason |

**Rule kept from Phase 4:** nothing the ML service produces is ever published automatically. Extracted items are `PENDING` and go through the same approval as any other change. Complexity is labelled as ChlatVei's own estimate, never as official information.

## Run all three

```bash
docker compose up -d postgres                                   # database (port 55432)

cd ml-service                                                   # ML service (port 8000)
../.venv/Scripts/python -m uvicorn app:app --port 8000          # API docs: http://localhost:8000/docs

cd backend                                                      # backend (port 3000)
# in backend/.env:  ML_SERVICE_URL=http://localhost:8000
npm run start:dev

cd frontend && npm start                                        # http://localhost:4200
```

Backend settings (`backend/.env`):

| Variable | Default | Meaning |
|---|---|---|
| `ML_SERVICE_URL` | not set | Where the ML service is. **If unset, ML features are off** and search uses the database |
| `ML_TIMEOUT_MS` | 3000 | Longest wait for search and complexity calls (extraction allows 15 s) |
| `ML_API_KEY` | not set | Optional shared key sent as `X-Internal-Key`; set the same value as `ML_API_KEY` on the ML service |
| `DATA_DIR` | `../data` | Where extraction jobs read source text (`processed/text/<code>/<snapshot>.txt`) |

## Model versions

Every response carries a `modelVersion` (`search-char-tfidf-names50-1.0`, `extract-rules-1.0`, `complexity-baseline-1.0`). Stored complexity scores and extraction jobs record the version that produced them, so a result can always be traced. Bump the version string in `ml-service/app.py` whenever behaviour changes.

## How each piece was checked

| Check | Where | Result |
|---|---|---|
| The ML package and API: ranking, extraction (including **verbatim evidence**), complexity, input limits, internal key | `ml-service/tests/` | 33 tests pass |
| Backend integration against a **fake ML server** that can be healthy, broken or slow: ML search used; fallback on error; fallback on timeout (answers in under 1.4 s); complexity stored and shown publicly; 503 when down; extraction creates only PENDING items and doesn't duplicate on re-run; FAILED when down; unlinked sources refused | `backend/test/ml-integration.e2e-spec.ts` | 8 tests pass (36 backend e2e in total) |
| The new admin routes are admin-only | `backend/test/authorization.e2e-spec.ts` (finds routes automatically) | 401 anonymous / 403 citizen |
| **Full stack in a real browser:** the Khmer phrase `ប្រឡងបណ្ណបើកបរម៉ូតូ`, which never appears on any page, finds the driver's-license service; the complexity box and its "not official" note show | `frontend/e2e/citizen.spec.ts` | Pass |
| A real extraction run on the vehicle-registration page | manual run, demo database | 18 findings queued as PENDING with verbatim evidence (for example `៣៨.០០០៛`) |

## What Phase 7 changed besides the new code

- **Bug fixed:** extracted fee evidence was a normalized copy (lower-cased, Khmer digits converted). It is now the exact text from the page, like every Phase 2 fact. A test enforces it, and the Phase 6 scores are unchanged.
- **Khmer digits:** the complexity score shows `៣៨ / ១០០` in Khmer mode.

## Known limits

- **Extraction quality is the Phase 6 baseline.** Most "documents" it finds on the vehicle page are FAQ questions, which an admin should reject. That is why every finding goes to review. Improving the extractor is Phase 8 work, measured against the Phase 6 numbers.
- **Search candidates contain only verified content.** A service with no published content can't be found by ML search. That is intended, since unpublished content must not leak into search.
- **There is no admin screen yet** to start an extraction or recompute complexity. Both are API calls today; admin UI is part of Phase 8.
- **The ML service keeps up to 8 fitted search indexes in memory,** keyed by catalogue content. A change to published content builds a new one automatically.
