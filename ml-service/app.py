"""ChlatVei ML service (Phase 7).

A small, stateless HTTP API over the `chlatvei_ml` package. Only the NestJS
backend calls it, over the internal network (never the browser). It never
touches the database: the backend sends what is needed and stores the results.

Endpoints (docs/architecture/03_api_spec.md#internal-ml-service-not-exposed-publicly):
  GET  /health
  POST /search/similar
  POST /extract
  POST /predict-complexity

Run:  uvicorn app:app --port 8000      (from ml-service/)
"""

from __future__ import annotations

import hashlib
import json
import os
from collections import OrderedDict
from threading import Lock

import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from chlatvei_ml import complexity as cx
from chlatvei_ml.extraction import extract
from chlatvei_ml.search import FieldWeightedRanker

# Bump a version whenever behaviour changes, so stored predictions can be traced to the model that made them.
SEARCH_VERSION = "search-char-tfidf-names50-1.0"
EXTRACT_VERSION = "extract-rules-1.0"
COMPLEXITY_VERSION = "complexity-baseline-1.0"

app = FastAPI(title="ChlatVei ML service", version="1.0.0", docs_url="/docs", redoc_url=None)


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    """If ML_API_KEY is set, every call must present it (defence in depth on the internal network)."""
    expected = os.environ.get("ML_API_KEY")
    if expected and x_internal_key != expected:
        raise HTTPException(status_code=401, detail="invalid internal key")


# ─── Search ────────────────────────────────────────────────────────────────


class Candidate(BaseModel):
    id: str = Field(max_length=100)
    name: str = Field(default="", max_length=1_000)
    text: str = Field(default="", max_length=200_000)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    candidates: list[Candidate] = Field(max_length=5_000)
    topK: int = Field(default=10, ge=1, le=50)


class SearchHit(BaseModel):
    id: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchHit]
    modelVersion: str


class _RankerCache:
    """Fitting TF-IDF is cheap but not free; reuse the fitted ranker while the catalogue is unchanged."""

    def __init__(self, size: int = 8):
        self.size = size
        self._items: OrderedDict[str, FieldWeightedRanker] = OrderedDict()
        self._lock = Lock()

    def get(self, candidates: list[Candidate]) -> FieldWeightedRanker:
        key = hashlib.sha256(json.dumps([c.model_dump() for c in candidates], ensure_ascii=False).encode()).hexdigest()
        with self._lock:
            if key in self._items:
                self._items.move_to_end(key)
                return self._items[key]
        docs = pd.DataFrame([{"service_slug": c.id, "name": c.name, "text": f"{c.name}\n{c.text}"} for c in candidates])
        ranker = FieldWeightedRanker(0.5).fit(docs)
        with self._lock:
            self._items[key] = ranker
            while len(self._items) > self.size:
                self._items.popitem(last=False)
        return ranker


_rankers = _RankerCache()


@app.post("/search/similar", response_model=SearchResponse, dependencies=[Depends(require_internal_key)])
def search_similar(req: SearchRequest) -> SearchResponse:
    """Character n-gram TF-IDF, 50% names + 50% content: the best system in the Phase 6 evaluation."""
    if not req.candidates:
        return SearchResponse(results=[], modelVersion=SEARCH_VERSION)
    ranked = _rankers.get(req.candidates).rank(req.query)[: req.topK]
    return SearchResponse(results=[SearchHit(id=i, score=round(s, 4)) for i, s in ranked], modelVersion=SEARCH_VERSION)


# ─── Extraction ────────────────────────────────────────────────────────────


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500_000)


class ExtractedFee(BaseModel):
    amount: int
    currency: str
    text: str


class ExtractResponse(BaseModel):
    fees: list[ExtractedFee]
    documents: list[str]
    confidence: float
    modelVersion: str


@app.post("/extract", response_model=ExtractResponse, dependencies=[Depends(require_internal_key)])
def extract_fields(req: ExtractRequest) -> ExtractResponse:
    """Rule-based baseline. Phase 6 measured it: fine on English lists, weak on prose and Khmer.
    Every result goes to admin review; nothing extracted is ever published automatically."""
    result = extract(req.text)
    return ExtractResponse(
        fees=[ExtractedFee(**f) for f in result.fees],
        documents=result.documents,
        confidence=result.confidence,
        modelVersion=EXTRACT_VERSION,
    )


# ─── Complexity ────────────────────────────────────────────────────────────


class ComplexityFeatures(BaseModel):
    documents: int = Field(ge=0, le=1000)
    steps: int = Field(ge=0, le=1000)
    fee_tiers: int = Field(ge=0, le=1000)
    max_fee_khr: float = Field(ge=0)
    conditions: int = Field(ge=0, le=1000)
    information_gaps: int = Field(ge=0, le=len(cx.CORE_FIELDS))


class ComplexityRequest(BaseModel):
    features: ComplexityFeatures


class Factor(BaseModel):
    name: str
    cost: str
    contribution: float  # points of the 0-100 score


class ComplexityResponse(BaseModel):
    score: float
    factors: list[Factor]  # largest first
    modelVersion: str


@app.post("/predict-complexity", response_model=ComplexityResponse, dependencies=[Depends(require_internal_key)])
def predict_complexity(req: ComplexityRequest) -> ComplexityResponse:
    """Transparent baseline (equal weights, fixed caps). Not yet validated against citizen feedback."""
    frame = pd.DataFrame([req.features.model_dump()], index=["service"])
    row = cx.score(frame).iloc[0]
    factors = sorted(
        (Factor(name=f.name, cost=f.cost, contribution=float(row[f"part_{f.name}"])) for f in cx.FEATURES),
        key=lambda f: -f.contribution,
    )
    return ComplexityResponse(score=float(row["score"]), factors=factors, modelVersion=COMPLEXITY_VERSION)


# ─── Health ────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "modelVersions": {"search": SEARCH_VERSION, "extract": EXTRACT_VERSION, "complexity": COMPLEXITY_VERSION}}
