# ChlatVei (ឆ្លាតវៃ)

> Smarter Citizens, Simpler Services.

ChlatVei is a Cambodian digital citizen platform that turns scattered public-service information into clear, structured, verifiable guidance, and uses data science to find and explain what makes a service hard for citizens.

For each service, citizens can see eligibility, required documents, steps, fees, processing time, locations, and official sources, along with the date the information was last verified. They can then track their progress with a personal checklist. Administrators review and verify every piece of information before it is published, and ChlatVei keeps the full source and verification history.

## Status

**Phase 1: Research.** Findings are in [docs/research](docs/research/README.md). See [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) for the full specification and development order.

## Repository layout

```text
frontend/      React + TypeScript + Tailwind (citizen & admin UI)
backend/       NestJS + TypeScript REST API (PostgreSQL)
ml-service/    Python FastAPI service (extraction, complexity, similarity)
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
