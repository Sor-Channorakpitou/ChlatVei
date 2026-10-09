import pytest
from fastapi.testclient import TestClient

import app as ml_app

client = TestClient(ml_app.app)

CANDIDATES = [
    {"id": "driver", "name": "ផ្តល់បណ្ណបើកបរ Driver's license", "text": "Driving test fee 30,000 riels ប្រឡងទ្រឹស្តី"},
    {"id": "passport", "name": "Ordinary passport", "text": "Passport application at the identification department"},
    {"id": "birth", "name": "Birth registration", "text": "Birth certificate at the commune"},
]


def test_health_reports_model_versions():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert set(body["modelVersions"]) == {"search", "extract", "complexity"}


def test_search_ranks_the_matching_service_first_in_khmer_and_english():
    for query, expected in [("ប្រឡងបណ្ណបើកបរ", "driver"), ("passport", "passport")]:
        res = client.post("/search/similar", json={"query": query, "candidates": CANDIDATES, "topK": 3})
        assert res.status_code == 200
        body = res.json()
        assert body["results"][0]["id"] == expected
        assert body["modelVersion"].startswith("search-")


def test_search_respects_top_k_and_handles_no_candidates():
    res = client.post("/search/similar", json={"query": "license", "candidates": CANDIDATES, "topK": 1}).json()
    assert len(res["results"]) <= 1
    assert client.post("/search/similar", json={"query": "x", "candidates": []}).json()["results"] == []


def test_search_validates_input():
    assert client.post("/search/similar", json={"query": "", "candidates": CANDIDATES}).status_code == 422
    assert client.post("/search/similar", json={"query": "a" * 201, "candidates": CANDIDATES}).status_code == 422


def test_extract_returns_fees_documents_and_confidence():
    text = 'Fees:\nA "motorbike" 30,000 Riels\nRequired documents include:\nPassport\nValid visa\n\nFOR INFORMATION OR SUPPORT'
    body = client.post("/extract", json={"text": text}).json()
    assert {f["amount"] for f in body["fees"]} == {30000}
    assert body["documents"] == ["Passport", "Valid visa"]
    assert body["confidence"] == 1.0


def test_predict_complexity_returns_score_and_ordered_factors():
    features = {"documents": 5, "steps": 3, "fee_tiers": 2, "max_fee_khr": 100000, "conditions": 1, "information_gaps": 1}
    body = client.post("/predict-complexity", json={"features": features}).json()
    assert 0 <= body["score"] <= 100
    contributions = [f["contribution"] for f in body["factors"]]
    assert contributions == sorted(contributions, reverse=True)
    assert abs(sum(contributions) - body["score"]) < 0.5
    assert body["factors"][0]["name"] == "documents"


def test_predict_complexity_rejects_invalid_features():
    bad = {"documents": -1, "steps": 0, "fee_tiers": 0, "max_fee_khr": 0, "conditions": 0, "information_gaps": 0}
    assert client.post("/predict-complexity", json={"features": bad}).status_code == 422


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("ML_API_KEY", "secret-123")


def test_internal_key_is_enforced_when_configured(with_key):
    payload = {"query": "passport", "candidates": CANDIDATES}
    assert client.post("/search/similar", json=payload).status_code == 401
    assert client.post("/search/similar", json=payload, headers={"X-Internal-Key": "secret-123"}).status_code == 200
    assert client.get("/health").status_code == 200  # health stays open for container checks
