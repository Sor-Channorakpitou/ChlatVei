# ChlatVei

> Smarter Citizens, Simpler Services.

ChlatVei is a Cambodian digital citizen platform that turns scattered public-service information into clear, structured, verifiable guidance, and uses data science to find and explain what makes a service hard for citizens.

For each service, citizens can see eligibility, required documents, steps, fees, processing time, locations, and official sources, along with the date the information was last verified. They can then track their progress with a personal checklist. Administrators review and verify every piece of information before it is published, and ChlatVei keeps the full source and verification history.

## Status

- **Phase 1: Research.** Done; see [docs/research](docs/research/README.md).
- **Phase 2: Data.** In progress; see the [Phase 2 report](docs/data/phase2_report.md), [collection methodology](docs/data/collection_methodology.md) and [data dictionary](data/metadata/data_dictionary.md).
- **Phase 3: Architecture.** Done; see [docs/architecture](docs/architecture/README.md): system design, data model, API spec, auth, and ADRs.
- **Phase 4: Backend.** Done; see the [backend guide](docs/backend/README.md). 28 end-to-end tests cover the spec's citizen and admin flows.
- **Phase 5: Frontend.** Done; see the [frontend guide](docs/frontend/README.md). Angular mobile-first PWA, Khmer first; browser tests cover the citizen and admin flows.
- **Phase 6: Data science.** Done; see the [Phase 6 report](docs/data-science/phase6_report.md). Khmer-aware search beats keyword search (MRR 0.73 vs 0.45), there is an extraction baseline, and a complexity baseline with sensitivity analysis.
- **Phase 7: ML integration.** Done; see the [ML integration guide](docs/ml-integration/README.md). The FastAPI ML service powers search, complexity and extraction, with fallbacks when it's down.
- **Phase 8: Verification & intelligence.** Done; see the [admin guide](docs/admin-guide/README.md): extraction from Sources, review filters and confidence, feedback triage, complexity analytics, user management, public change history.
- **Phase 9: Security & testing.** Done; see the [security review](docs/security/README.md): 6 findings fixed (IP spoofing, account lockout, JWT algorithm, search wildcards, 2 dependency issues), 0 known vulnerabilities.
- **Screens:** [design images](docs/design/README.md) and [screenshots of the real app](docs/design/app-screens).

See [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) for the full specification and development order.

## Repository layout

```text
frontend/      Angular mobile-first PWA (citizen & admin UI)
backend/       NestJS + TypeScript REST API (PostgreSQL)
ml-service/    Python FastAPI ML service + chlatvei_ml package (search, extraction, complexity)
data/
  raw/         Original collected sources; never modified
  processed/   Cleaned / normalized datasets
  external/    Third-party reference data
  metadata/    Data dictionary, provenance, collection logs
notebooks/     Exploration and experiments (reusable logic lives in modules)
pipelines/     Reproducible data-processing scripts
docs/          Specification, research, architecture, API docs
tests/         Cross-service and end-to-end tests
```

## Branching

- `main`: stable releases
- `development`: integration branch
- `feature/*`: one branch per feature, merged through pull requests

Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, ...).

## Security

Never commit `.env` files, API keys, passwords, database credentials, or tokens. Use `.env.example` to document the required variables.

## Run the backend

See [docs/backend/README.md](docs/backend/README.md#1-run-it-about-5-minutes). In short: `docker compose up -d postgres`, then in `backend/`: `npm install`, `npx prisma migrate deploy`, `npm run seed`, `npm run start:dev`.

## Run the frontend

With the backend running: `cd frontend && npm install && npm start`, then open http://localhost:4200. See [docs/frontend/README.md](docs/frontend/README.md).

## Data pipeline

```bash
python -m venv .venv
.venv/Scripts/pip install -r pipelines/requirements.txt   # .venv/bin/pip on Linux/macOS
cd pipelines
../.venv/Scripts/python collect_sources.py   # snapshot official sources into data/raw
../.venv/Scripts/python extract_text.py      # text extraction (+ Khmer OCR via Tesseract)
../.venv/Scripts/python coverage.py          # service x field coverage
../.venv/Scripts/python -m pytest            # pipeline + dataset integrity tests
```
