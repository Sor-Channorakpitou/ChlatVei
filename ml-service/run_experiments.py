"""Reproduces every Phase 6 result and writes it to data/evaluation/results/.

    cd ml-service && ../.venv/Scripts/python run_experiments.py

Outputs (all CSV/JSON, versioned in git so numbers in the report can be checked):
  search_summary.csv      Recall@1/@3 and MRR per ranker and query language (RQ4)
  search_per_query.csv    rank of the right service for every query (error analysis)
  search_significance.json paired bootstrap of MRR differences vs. the keyword baseline
  extraction.csv          field-level precision/recall/F1 per source (RQ2)
  complexity_scores.csv   baseline complexity score and per-feature contributions (RQ1)
  complexity_sensitivity.csv rank stability under random weightings
  summary.json            headline numbers used in docs/data-science/phase6_report.md
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from chlatvei_ml import complexity as cx
from chlatvei_ml.data import DATA, Dataset
from chlatvei_ml.extraction import evaluate_source
from chlatvei_ml.search import FieldWeightedRanker, KeywordRanker, TfidfRanker, bootstrap_mrr_difference, compare

OUT = DATA / "evaluation" / "results"

# Sources with gold annotations. S001 was used while writing the extraction rules
# (development); S003 was not looked at (held out).
EXTRACTION_SOURCES = {"S001": "development", "S003": "held-out"}


def run() -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    ds = Dataset.load()

    # ── RQ4: search ────────────────────────────────────────────────────────
    queries = pd.read_csv(DATA / "evaluation" / "search_queries.csv", dtype=str, keep_default_na=False)
    docs = ds.service_documents()
    rankers = [
        KeywordRanker(),
        TfidfRanker("word", (1, 1), label="tf-idf word"),
        TfidfRanker("char_wb", (2, 4), label="tf-idf char 2-4"),
        TfidfRanker("char_wb", (2, 4), field="name", label="tf-idf char 2-4, names only"),
        FieldWeightedRanker(0.5),
    ]
    summary, per_query = compare(rankers, docs, queries)
    summary.to_csv(OUT / "search_summary.csv", index=False)
    per_query.to_csv(OUT / "search_per_query.csv", index=False)

    baseline = per_query[per_query["ranker"] == rankers[0].name].reset_index(drop=True)
    significance = {}
    for r in rankers[1:]:
        other = per_query[per_query["ranker"] == r.name].reset_index(drop=True)
        significance[r.name] = {
            lang: bootstrap_mrr_difference(other[mask], baseline[mask])
            for lang, mask in {"all": other["language"].notna(), "km": other["language"] == "km", "en": other["language"] == "en"}.items()
        }
    (OUT / "search_significance.json").write_text(json.dumps(significance, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── RQ2: extraction ────────────────────────────────────────────────────
    extraction = pd.concat(
        [evaluate_source(sid, ds.source_text(sid), ds.facts).assign(split=split) for sid, split in EXTRACTION_SOURCES.items()],
        ignore_index=True,
    )
    extraction.to_csv(OUT / "extraction.csv", index=False)

    # ── RQ1: complexity baseline ───────────────────────────────────────────
    features = cx.service_features(ds.facts)
    scores = cx.score(features)
    scores["main_contributors"] = [", ".join(cx.explain(row)) for _, row in scores.iterrows()]
    scores.join(features).to_csv(OUT / "complexity_scores.csv")
    sens = cx.sensitivity(features)
    sens.to_csv(OUT / "complexity_sensitivity.csv")

    best = summary[summary["language"] == "all"].sort_values("mrr", ascending=False).iloc[0]
    result = {
        "queries": int(len(queries)),
        "queries_by_language": queries["language"].value_counts().to_dict(),
        "search_best_overall": {"ranker": best["ranker"], "mrr": float(best["mrr"])},
        "search_mrr": summary.pivot(index="ranker", columns="language", values="mrr").round(3).to_dict(orient="index"),
        "extraction": extraction[["source_id", "split", "field", "precision", "recall", "f1"]].to_dict(orient="records"),
        "complexity_scores": scores["score"].to_dict(),
        "complexity_same_order_share": round(sens.attrs["same_order_share"], 3),
    }
    (OUT / "summary.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, ensure_ascii=False))
