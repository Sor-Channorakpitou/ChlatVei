"""Service Complexity Score: transparent baseline (RQ1).

Grounded in the administrative-burden framework (Moynihan, Herd & Harvey 2015):
structural features are grouped into *compliance* costs (what you must bring, do
and pay) and *learning* costs (conditions to understand, information that is missing).

Deliberate limits:
- Weights are equal. No weighting is claimed to be "correct" (spec §13); a sensitivity
  analysis shows how much the ranking depends on that choice.
- Each feature is scaled against a fixed reference cap, not against the other services,
  so a score does not change when unrelated services are added.
- The score is validated only against citizen-reported difficulty (`validate_against_feedback`),
  once enough real feedback exists.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

CORE_FIELDS = ["eligibility", "required_document", "step", "fee", "processing_time", "location", "contact"]


@dataclass(frozen=True)
class Feature:
    name: str
    cost: str  # "compliance" | "learning"
    cap: float  # value at which the feature counts as fully complex (assumption, documented)
    log: bool = False
    label_en: str = ""


FEATURES: tuple[Feature, ...] = (
    Feature("documents", "compliance", 10, label_en="Many required documents"),
    Feature("steps", "compliance", 10, label_en="Many steps"),
    Feature("fee_tiers", "compliance", 6, label_en="Many different fees"),
    # Linear, not log: a log scale saturated (120,000 and 180,000 riel both scored ~0.87), see phase6 report.
    Feature("max_fee_khr", "compliance", 1_000_000, label_en="High fee"),
    Feature("conditions", "learning", 6, label_en="Many conditions to understand"),
    Feature("information_gaps", "learning", len(CORE_FIELDS), label_en="Official information is incomplete"),
)


def service_features(facts: pd.DataFrame) -> pd.DataFrame:
    """Raw feature values per annotated service, from the (verified or annotated) facts."""
    rows = []
    for slug, f in facts.groupby("service_slug"):
        stated = f[f["status"] == "stated"]
        fees = stated[stated["field"] == "fee"]
        amounts = [float(a) for a, c in zip(fees["amount"], fees["currency"]) if a and c == "KHR"]
        stated_fields = set(stated["field"])
        rows.append({
            "service_slug": slug,
            "documents": int((stated["field"] == "required_document").sum()),
            "steps": int((stated["field"] == "step").sum()),
            "fee_tiers": int(len(fees)),
            "max_fee_khr": max(amounts) if amounts else 0.0,
            "conditions": int(stated["field"].isin(["condition", "eligibility"]).sum()),
            "information_gaps": int(sum(field not in stated_fields for field in CORE_FIELDS)),
        })
    return pd.DataFrame(rows).set_index("service_slug")


def normalize_feature(value: float, feature: Feature) -> float:
    if feature.log:
        return min(1.0, math.log1p(max(value, 0)) / math.log1p(feature.cap))
    return min(1.0, max(value, 0) / feature.cap)


def score(features: pd.DataFrame, weights: dict[str, float] | None = None) -> pd.DataFrame:
    """0–100 score per service plus each feature's share of it (the 'why')."""
    weights = weights or {f.name: 1.0 for f in FEATURES}
    total_w = sum(weights.values())
    out = []
    for slug, row in features.iterrows():
        parts = {f.name: weights[f.name] * normalize_feature(row[f.name], f) / total_w for f in FEATURES}
        value = 100 * sum(parts.values())
        out.append({"service_slug": slug, "score": round(value, 1), **{f"part_{k}": round(100 * v, 1) for k, v in parts.items()}})
    return pd.DataFrame(out).set_index("service_slug").sort_values("score", ascending=False)


def explain(row: pd.Series, top: int = 3) -> list[str]:
    """Main contributors, in plain language, largest first (spec §13 example)."""
    parts = sorted(((row[f"part_{f.name}"], f) for f in FEATURES), key=lambda x: -x[0])
    return [f.label_en for value, f in parts[:top] if value > 0]


def sensitivity(features: pd.DataFrame, draws: int = 2000, seed: int = 0) -> pd.DataFrame:
    """How stable is the ranking if the (equal) weights were different?

    Draws random weightings from a flat Dirichlet distribution and records each
    service's rank. Returns rank statistics and how often the equal-weight
    ranking is reproduced exactly.
    """
    rng = np.random.default_rng(seed)
    base_order = list(score(features).index)
    ranks = {s: [] for s in features.index}
    same = 0
    for w in rng.dirichlet(np.ones(len(FEATURES)), size=draws):
        order = list(score(features, {f.name: float(x) for f, x in zip(FEATURES, w)}).index)
        same += order == base_order
        for pos, slug in enumerate(order, start=1):
            ranks[slug].append(pos)
    stats = pd.DataFrame({
        s: {"baseline_rank": base_order.index(s) + 1, "mean_rank": np.mean(r), "best": min(r), "worst": max(r)} for s, r in ranks.items()
    }).T
    stats.attrs["same_order_share"] = same / draws
    return stats.sort_values("baseline_rank")


def validate_against_feedback(scores: pd.Series, perceived_difficulty: pd.Series, min_services: int = 8) -> dict[str, float | str]:
    """Spearman correlation between the score and mean citizen-reported difficulty (1–5).

    Refuses to report a correlation from too few services: with n < 8 it is not meaningful.
    """
    joined = pd.concat([scores.rename("score"), perceived_difficulty.rename("difficulty")], axis=1).dropna()
    if len(joined) < min_services:
        return {"status": f"insufficient data: {len(joined)} services with feedback (need {min_services})"}
    rho, p = spearmanr(joined["score"], joined["difficulty"])
    return {"status": "ok", "n": len(joined), "spearman_rho": round(float(rho), 3), "p_value": round(float(p), 4)}
