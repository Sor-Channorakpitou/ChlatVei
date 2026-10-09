# ml-service

Data-science code for ChlatVei.

- **Phase 6 (done):** the `chlatvei_ml` package, plus experiments and evaluation for search (RQ4), extraction (RQ2) and complexity (RQ1). See [docs/data-science/phase6_report.md](../docs/data-science/phase6_report.md).
- **Phase 7 (done):** `app.py` is a small FastAPI service (`/search/similar`, `/extract`, `/predict-complexity`, `/health`) that the NestJS backend calls. See [docs/ml-integration](../docs/ml-integration/README.md).

Run: `../.venv/Scripts/python -m uvicorn app:app --port 8000` (API docs at `/docs`).

```text
chlatvei_ml/
  khmer.py        Khmer text helpers (normalization, script detection)
  data.py         loads data/metadata + data/processed into pandas
  search.py       keyword baseline, TF-IDF rankers, Recall@k / MRR, paired bootstrap
  extraction.py   rule-based fee and document extractor + field-level P/R/F1
  complexity.py   complexity features, score, explanations, sensitivity, validation gate
run_experiments.py  reproduces every number in the Phase 6 report
build_notebooks.py  generates notebooks 05–08 from code
app.py              FastAPI service (Phase 7)
tests/              pytest suite (33 tests)
```

```bash
../.venv/Scripts/pip install -r requirements-dev.txt
../.venv/Scripts/python -m pytest
../.venv/Scripts/python run_experiments.py
```
