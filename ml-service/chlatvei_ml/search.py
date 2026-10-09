"""Service search rankers and their evaluation (RQ4).

Every ranker takes the same service documents and returns, for a query, the
service slugs ordered best-first with scores. They are compared on a labeled
query set with Recall@k and MRR, overall and per query language.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .khmer import normalize, query_language


class Ranker(Protocol):
    name: str

    def fit(self, docs: pd.DataFrame) -> "Ranker": ...

    def rank(self, query: str) -> list[tuple[str, float]]: ...


class KeywordRanker:
    """Baseline: share of the query's space-separated terms that appear verbatim in the document.

    This is how a plain database `ILIKE '%term%'` search behaves. A Khmer query usually
    has no spaces, so it is one long term that must appear exactly as typed.
    """

    name = "keyword (baseline)"

    def __init__(self, field: str = "text"):
        self.field = field

    def fit(self, docs: pd.DataFrame) -> "KeywordRanker":
        self.slugs = list(docs["service_slug"])
        self.texts = [normalize(t) for t in docs[self.field]]
        return self

    def rank(self, query: str) -> list[tuple[str, float]]:
        terms = [t for t in normalize(query).split(" ") if t]
        if not terms:
            return []
        scores = [sum(t in text for t in terms) / len(terms) for text in self.texts]
        return _ordered(self.slugs, np.array(scores))


class TfidfRanker:
    """TF-IDF + cosine similarity, with either word or character n-gram features."""

    def __init__(self, analyzer: str = "char_wb", ngram_range: tuple[int, int] = (2, 4), field: str = "text", label: str | None = None):
        self.analyzer = analyzer
        self.ngram_range = ngram_range
        self.field = field
        self.name = label or f"tf-idf {analyzer} {ngram_range[0]}-{ngram_range[1]}"

    def fit(self, docs: pd.DataFrame) -> "TfidfRanker":
        self.slugs = list(docs["service_slug"])
        self.vectorizer = TfidfVectorizer(
            analyzer=self.analyzer,
            ngram_range=self.ngram_range,
            preprocessor=normalize,
            sublinear_tf=True,
            min_df=1,
        )
        self.matrix = self.vectorizer.fit_transform(docs[self.field])
        return self

    def rank(self, query: str) -> list[tuple[str, float]]:
        q = self.vectorizer.transform([query])
        if q.nnz == 0:
            return []
        return _ordered(self.slugs, cosine_similarity(q, self.matrix).ravel())


class FieldWeightedRanker:
    """Weighted sum of a ranker on service names and a ranker on full content.

    Names are precise but short; content has more vocabulary but more noise.
    The weights are fixed in advance (not tuned on the evaluation queries).
    """

    def __init__(self, name_weight: float = 0.5, analyzer: str = "char_wb", ngram_range: tuple[int, int] = (2, 4)):
        self.name_weight = name_weight
        self.on_name = TfidfRanker(analyzer, ngram_range, field="name")
        self.on_text = TfidfRanker(analyzer, ngram_range, field="text")
        self.name = f"tf-idf char 2-4, names {name_weight:.0%} + content {1 - name_weight:.0%}"

    def fit(self, docs: pd.DataFrame) -> "FieldWeightedRanker":
        self.slugs = list(docs["service_slug"])
        self.on_name.fit(docs)
        self.on_text.fit(docs)
        return self

    def rank(self, query: str) -> list[tuple[str, float]]:
        name_scores = dict(self.on_name.rank(query))
        text_scores = dict(self.on_text.rank(query))
        combined = np.array([
            self.name_weight * name_scores.get(s, 0.0) + (1 - self.name_weight) * text_scores.get(s, 0.0) for s in self.slugs
        ])
        return _ordered(self.slugs, combined)


def _ordered(slugs: list[str], scores: np.ndarray) -> list[tuple[str, float]]:
    """Services with a positive score, best first. Ties keep a stable order."""
    order = np.argsort(-scores, kind="stable")
    return [(slugs[i], float(scores[i])) for i in order if scores[i] > 0]


# ─── Evaluation ────────────────────────────────────────────────────────────


@dataclass
class QueryResult:
    query: str
    language: str
    kind: str
    expected: str
    rank: int | None  # 1-based position of the expected service, None if not returned
    top: str | None


def evaluate(ranker: Ranker, queries: pd.DataFrame) -> pd.DataFrame:
    """Runs every labeled query; returns one row per query with the rank of the right answer."""
    rows = []
    for q in queries.itertuples():
        ranked = [slug for slug, _ in ranker.rank(q.query)]
        rank = ranked.index(q.expected_service) + 1 if q.expected_service in ranked else None
        rows.append(QueryResult(q.query, getattr(q, "language", query_language(q.query)), q.kind, q.expected_service, rank, ranked[0] if ranked else None))
    return pd.DataFrame([r.__dict__ for r in rows])


def metrics(results: pd.DataFrame) -> dict[str, float]:
    """Recall@1, Recall@3 and mean reciprocal rank (a miss counts as 0)."""
    ranks = results["rank"]
    rr = ranks.map(lambda r: 0.0 if pd.isna(r) else 1.0 / r)
    return {
        "n": int(len(results)),
        "recall@1": round(float((ranks == 1).mean()), 3),
        "recall@3": round(float(ranks.le(3).fillna(False).mean()), 3),
        "mrr": round(float(rr.mean()), 3),
    }


def compare(rankers: list[Ranker], docs: pd.DataFrame, queries: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fits each ranker on the same documents and evaluates it on the same queries.

    Returns (summary by ranker and language, per-query results for error analysis).
    """
    summary, detail = [], []
    for ranker in rankers:
        ranker.fit(docs)
        res = evaluate(ranker, queries)
        res.insert(0, "ranker", ranker.name)
        detail.append(res)
        summary.append({"ranker": ranker.name, "language": "all", **metrics(res)})
        for lang, group in res.groupby("language"):
            summary.append({"ranker": ranker.name, "language": lang, **metrics(group)})
    return pd.DataFrame(summary), pd.concat(detail, ignore_index=True)


def bootstrap_mrr_difference(a: pd.DataFrame, b: pd.DataFrame, n: int = 2000, seed: int = 0) -> dict[str, float]:
    """Paired bootstrap of MRR(a) − MRR(b) over the same queries, with a 95% interval.

    With a small query set, a difference is only meaningful if the interval excludes 0.
    """
    rr = lambda df: df["rank"].map(lambda r: 0.0 if pd.isna(r) else 1.0 / r).to_numpy()
    ra, rb = rr(a), rr(b)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(ra), size=(n, len(ra)))
    diffs = ra[idx].mean(axis=1) - rb[idx].mean(axis=1)
    return {
        "mrr_diff": round(float(ra.mean() - rb.mean()), 3),
        "ci_low": round(float(np.percentile(diffs, 2.5)), 3),
        "ci_high": round(float(np.percentile(diffs, 97.5)), 3),
    }
