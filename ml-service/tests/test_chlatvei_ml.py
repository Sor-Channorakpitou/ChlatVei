import math

import numpy as np
import pandas as pd
import pytest

from chlatvei_ml import complexity as cx
from chlatvei_ml.extraction import document_matches, extract_documents, extract_fees, parse_amount, prf
from chlatvei_ml.khmer import is_khmer, normalize, query_language
from chlatvei_ml.search import FieldWeightedRanker, KeywordRanker, TfidfRanker, bootstrap_mrr_difference, evaluate, metrics

# ─── Khmer helpers ─────────────────────────────────────────────────────────


def test_normalize_removes_zero_width_and_converts_khmer_digits():
    assert normalize("បណ្ណ​បើកបរ  ៣០០០០៛") == "បណ្ណបើកបរ 30000៛"
    assert normalize("Driving LICENSE") == "driving license"


def test_query_language():
    assert query_language("បណ្ណបើកបរ") == "km"
    assert query_language("driving license") == "en"
    assert query_language("license បណ្ណបើកបរ") == "mixed"
    assert is_khmer("ក") and not is_khmer("a")


# ─── Search ────────────────────────────────────────────────────────────────

DOCS = pd.DataFrame([
    {"service_slug": "driver", "name": "Driving license បណ្ណបើកបរ", "text": "Driving license test fee 30,000 riels បណ្ណបើកបរ ប្រឡងទ្រឹស្តី"},
    {"service_slug": "passport", "name": "Passport លិខិតឆ្លងដែន", "text": "Ordinary passport application លិខិតឆ្លងដែន"},
    {"service_slug": "birth", "name": "Birth registration សំបុត្រកំណើត", "text": "Birth certificate at the commune សំបុត្រកំណើត"},
])


@pytest.mark.parametrize("ranker", [KeywordRanker(), TfidfRanker("word", (1, 1)), TfidfRanker("char_wb", (2, 4)), FieldWeightedRanker()])
def test_rankers_find_the_obvious_service(ranker):
    ranker.fit(DOCS)
    assert ranker.rank("passport")[0][0] == "passport"
    assert ranker.rank("សំបុត្រកំណើត")[0][0] == "birth"


def test_character_ngrams_match_a_khmer_sub_phrase_that_keyword_search_misses():
    # The query is a longer Khmer phrase; it does not occur verbatim in any document.
    query = "ប្រឡងបណ្ណបើកបរម៉ូតូ"
    assert KeywordRanker().fit(DOCS).rank(query) == []
    assert TfidfRanker("char_wb", (2, 4)).fit(DOCS).rank(query)[0][0] == "driver"


def test_rankers_return_nothing_for_unrelated_queries():
    assert KeywordRanker().fit(DOCS).rank("zzzz") == []
    assert TfidfRanker("word", (1, 1)).fit(DOCS).rank("zzzz") == []


def test_metrics_and_misses():
    results = pd.DataFrame({"rank": [1, 2, None, 4]})
    m = metrics(results)
    assert m["recall@1"] == 0.25
    assert m["recall@3"] == 0.5
    assert m["mrr"] == round((1 + 0.5 + 0 + 0.25) / 4, 3)


def test_evaluate_records_rank_of_expected_service():
    queries = pd.DataFrame([{"query": "passport", "language": "en", "kind": "keyword", "expected_service": "passport"}])
    res = evaluate(TfidfRanker("word", (1, 1)).fit(DOCS), queries)
    assert res.loc[0, "rank"] == 1 and res.loc[0, "top"] == "passport"


def test_bootstrap_difference_is_zero_for_identical_systems():
    r = pd.DataFrame({"rank": [1, 2, None, 1]})
    out = bootstrap_mrr_difference(r, r)
    assert out == {"mrr_diff": 0.0, "ci_low": 0.0, "ci_high": 0.0}


# ─── Extraction ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("raw,expected", [("30,000", 30000), ("180.000", 180000), ("95000", 95000), ("៣០០០០", 30000)])
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == expected


def test_extract_fees_handles_english_and_khmer_formats():
    text = 'A "motorbike" 30,000 Riels\nតម្លៃ ៣០០០០៛ ។ ចំពោះតម្លៃ ១៨០.០០០៛\nVisa fee $36'
    fees = {(f["amount"], f["currency"]) for f in extract_fees(text)}
    assert fees == {(30000, "KHR"), (180000, "KHR"), (36, "USD")}


def test_extracted_fee_evidence_is_a_verbatim_quote():
    text = "ចំពោះតម្លៃ ១៨០.០០០៛ and 30,000 Riels"
    fees = extract_fees(text)
    assert {f["amount"] for f in fees} == {180000, 30000}
    for f in fees:
        assert f["text"] in text  # evidence must appear exactly as written on the page


def test_extract_documents_reads_the_list_after_a_heading():
    text = "Required documents include:\nPassport\nValid visa\n\nFOR INFORMATION OR SUPPORT\n1275"
    assert extract_documents(text) == ["Passport", "Valid visa"]


def test_document_matching_and_prf():
    assert document_matches("Medical Certificate", "Physical fitness (medical) certificate")
    assert document_matches("អត្តសញ្ញាណបណ្ណ", "ឯកសារត្រូវមាន៖ អត្តសញ្ញាណបណ្ណ")
    assert not document_matches("Passport", "Medical certificate")
    assert prf(2, 4, 2) == {"tp": 2, "predicted": 4, "gold": 2, "precision": 0.5, "recall": 1.0, "f1": round(2 * 0.5 / 1.5, 3)}


# ─── Complexity ────────────────────────────────────────────────────────────

FACTS = pd.DataFrame([
    {"service_slug": "a", "field": "required_document", "status": "stated", "amount": "", "currency": ""},
    {"service_slug": "a", "field": "required_document", "status": "stated", "amount": "", "currency": ""},
    {"service_slug": "a", "field": "fee", "status": "stated", "amount": "100000", "currency": "KHR"},
    {"service_slug": "a", "field": "processing_time", "status": "not_stated", "amount": "", "currency": ""},
    {"service_slug": "b", "field": "step", "status": "stated", "amount": "", "currency": ""},
])


def test_features_count_only_stated_facts_and_gaps():
    f = cx.service_features(FACTS)
    assert f.loc["a", "documents"] == 2
    assert f.loc["a", "max_fee_khr"] == 100000
    assert f.loc["a", "information_gaps"] == len(cx.CORE_FIELDS) - 2  # documents and fee stated
    assert f.loc["b", "steps"] == 1


def test_score_is_bounded_and_parts_add_up():
    s = cx.score(cx.service_features(FACTS))
    assert ((s["score"] >= 0) & (s["score"] <= 100)).all()
    parts = s[[c for c in s.columns if c.startswith("part_")]].sum(axis=1)
    assert np.allclose(parts, s["score"], atol=0.5)


def test_normalization_caps_at_one():
    feature = cx.Feature("documents", "compliance", 10)
    assert cx.normalize_feature(25, feature) == 1.0
    assert cx.normalize_feature(5, feature) == 0.5


def test_explain_lists_largest_contributors_first():
    s = cx.score(cx.service_features(FACTS))
    reasons = cx.explain(s.loc["a"])
    assert reasons[0] == "Official information is incomplete"


def test_sensitivity_is_reproducible():
    f = cx.service_features(FACTS)
    a, b = cx.sensitivity(f, draws=200, seed=1), cx.sensitivity(f, draws=200, seed=1)
    assert a.equals(b) and 0 <= a.attrs["same_order_share"] <= 1


def test_validation_refuses_small_samples_and_works_with_enough_data():
    few = cx.validate_against_feedback(pd.Series({"a": 10}), pd.Series({"a": 3}))
    assert few["status"].startswith("insufficient data")
    slugs = [f"s{i}" for i in range(10)]
    scores = pd.Series(range(10), index=slugs, dtype=float)
    difficulty = pd.Series([1, 1.5, 2, 2.2, 3, 3.1, 3.5, 4, 4.5, 5], index=slugs)
    out = cx.validate_against_feedback(scores, difficulty)
    assert out["status"] == "ok" and math.isclose(out["spearman_rho"], 1.0)
