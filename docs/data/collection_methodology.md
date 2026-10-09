# Data Collection Methodology

## Principles

1. **Official sources only for facts.** T1 (official) and T2 (official documents via archive) sources can support a fact. T3 sources are leads only.
2. **Raw is immutable.** Snapshots in `data/raw/` are never edited or overwritten. A changed page produces a new dated snapshot next to the old one.
3. **Every fact is quoted.** An annotated fact must quote its source verbatim. An automated test (`pipelines/tests/test_dataset_integrity.py`) fails if any quote is missing from the source text.
4. **Unknown ≠ none.** If a source doesn't mention something (for example, processing time), that is recorded explicitly as `not_stated`, never as zero or free.
5. **Nothing is verified by collection.** All facts start as `PENDING` and become `VERIFIED` only through admin review.
6. **Polite collection.** The collector identifies itself (`ChlatVei-collector/0.1` with the repository URL), waits 2 seconds between requests, follows robots.txt per RFC 9309, and **does not bypass bot challenges or logins**. Those sources are collected manually.

## Pipeline

```text
data/metadata/sources.csv  (curated registry)
          │
          ▼
pipelines/collect_sources.py ──► data/raw/<source_id>/<date>.<ext>
          │                       data/metadata/collection_log.csv (sha256, outcome)
          ▼
pipelines/extract_text.py    ──► data/processed/text/…  (html | pdf_text | ocr)
          │                       data/processed/documents.csv
          ▼
manual annotation            ──► data/processed/annotations/service_facts.csv
          │                       (verbatim evidence, PENDING)
          ▼
pipelines/coverage.py        ──► data/processed/field_coverage.csv

pipelines/detect_changes.py  ──► data/processed/change_reports/<date>.json
                                  (on re-collection: what changed, facts to re-check)
```

## Running it

```bash
python -m venv .venv
.venv/Scripts/pip install -r pipelines/requirements.txt   # Windows; use .venv/bin/pip on Linux/macOS

cd pipelines
../.venv/Scripts/python collect_sources.py          # or --only S001 S003
TESSERACT_CMD=/path/to/tesseract ../.venv/Scripts/python extract_text.py   # --no-ocr to skip OCR
../.venv/Scripts/python coverage.py
../.venv/Scripts/python detect_changes.py           # after re-collecting: report content changes
../.venv/Scripts/python -m pytest
```

OCR requires [Tesseract](https://github.com/tesseract-ocr/tesseract) 5.x with the `khm` and `eng` language data.

## Detecting changes (spec §24)

`collect_sources.py` only stores a new snapshot when a source's SHA-256 changes. `detect_changes.py` then compares the two latest snapshots of each source on their extracted text (so markup-only changes are ignored) and writes `data/processed/change_reports/<date>.json` with:

- the lines added and removed;
- the fields those lines seem to touch (`fee`, `required_document`, `step`, `processing_time`, `eligibility`), from Khmer and English keyword cues;
- every annotated fact that quoted the previous snapshot, with `evidence_still_present: false` when its quote is gone.

It never edits `service_facts.csv`. A person re-checks each flagged fact against the new snapshot and, if it changed, appends a new fact row (new `fact_id`) quoting the new text. Run `extract_text.py` first so new snapshots have committed text (including OCR).

## Adding a source

1. Append a row to `data/metadata/sources.csv` with the next `source_id`.
2. Map it to services in `data/metadata/service_sources.csv`.
3. Run `collect_sources.py --only <id>`, then `extract_text.py`.
4. If the collector can't fetch it (bot challenge or login), save the page manually from a browser to `data/raw/<id>/<YYYY-MM-DD>.<ext>`, add a log row with `outcome=new` and `error=manual collection`, and note it in `sources.csv`.

## Annotating facts

1. Open the extracted text in `data/processed/text/<source_id>/`.
2. For each fact, append a row to `service_facts.csv` with the next `fact_id`. **Never renumber existing IDs.**
3. Copy the `evidence` exactly from the text. Line breaks may be replaced by spaces.
4. For each core field the source does not mention, add one `not_stated` row.
5. Record ambiguities and conflicts in `notes`, for example a Khmer FAQ that adds a condition the English list does not have.
6. Run `pytest` before committing.
