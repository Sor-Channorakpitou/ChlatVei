"""Schema and provenance checks for the committed metadata and annotations.

The key guarantee: every stated fact quotes evidence that literally appears in
the text extracted from its raw source snapshot, so no fact can be invented.
"""

import re
from pathlib import Path

import pandas as pd
import pytest

REPO = Path(__file__).resolve().parents[2]
META = REPO / "data" / "metadata"
PROCESSED = REPO / "data" / "processed"

SOURCE_TIERS = {"T1", "T2", "T3"}
LANGUAGES = {"en", "km"}
RELEVANCE = {"primary", "supporting", "legal_basis", "context"}
FACT_FIELDS = {
    "required_document", "step", "fee", "processing_time", "location",
    "contact", "eligibility", "condition", "validity",
}
FACT_STATUS = {"stated", "not_stated"}
REVIEW_STATUS = {"PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "OUTDATED"}


def read(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False)


@pytest.fixture(scope="module")
def services():
    return read(META / "services.csv")


@pytest.fixture(scope="module")
def sources():
    return read(META / "sources.csv")


@pytest.fixture(scope="module")
def service_sources():
    return read(META / "service_sources.csv")


@pytest.fixture(scope="module")
def facts():
    return read(PROCESSED / "annotations" / "service_facts.csv")


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# --- services / sources -----------------------------------------------------

def test_service_slugs_unique_and_well_formed(services):
    assert services["service_slug"].is_unique
    assert services["service_slug"].str.fullmatch(r"[a-z0-9_]+").all()


def test_mvp_service_count_within_scope(services):
    assert 10 <= len(services) <= 20


def test_sources_have_valid_ids_urls_and_enums(sources):
    assert sources["source_id"].is_unique
    assert sources["source_id"].str.fullmatch(r"S\d{3}").all()
    assert sources["url"].str.startswith("https://").all()
    assert set(sources["tier"]) <= SOURCE_TIERS
    assert set(sources["language"]) <= LANGUAGES


def test_service_sources_reference_existing_rows(services, sources, service_sources):
    assert set(service_sources["service_slug"]) <= set(services["service_slug"])
    assert set(service_sources["source_id"]) <= set(sources["source_id"])
    assert set(service_sources["relevance"]) <= RELEVANCE
    assert not service_sources.duplicated(["service_slug", "source_id"]).any()


def test_every_service_has_at_least_one_source(services, service_sources):
    assert set(services["service_slug"]) == set(service_sources["service_slug"])


# --- annotated facts --------------------------------------------------------

def test_fact_schema(facts, services, sources):
    assert facts["fact_id"].is_unique
    assert set(facts["service_slug"]) <= set(services["service_slug"])
    assert set(facts["source_id"]) <= set(sources["source_id"])
    assert set(facts["field"]) <= FACT_FIELDS
    assert set(facts["status"]) <= FACT_STATUS
    assert set(facts["review_status"]) <= REVIEW_STATUS


def test_fees_have_numeric_amount_and_currency(facts):
    fees = facts[(facts["field"] == "fee") & (facts["status"] == "stated")]
    assert len(fees) > 0
    assert fees["amount"].str.fullmatch(r"\d+").all()
    assert fees["currency"].isin({"KHR", "USD"}).all()


def test_not_stated_rows_carry_no_evidence(facts):
    not_stated = facts[facts["status"] == "not_stated"]
    assert (not_stated["evidence"] == "").all()


def test_nothing_is_verified_without_a_reviewer(facts):
    verified = facts[facts["review_status"] == "VERIFIED"]
    assert (verified["reviewer"] != "").all()
    assert (verified["reviewed_at"] != "").all()


def test_every_stated_fact_is_quoted_from_its_snapshot(facts):
    stated = facts[facts["status"] == "stated"]
    missing = []
    for row in stated.itertuples():
        assert row.evidence, f"{row.fact_id} has no evidence"
        snapshot_stem = Path(row.snapshot).stem
        raw = REPO / "data" / "raw" / row.source_id / row.snapshot
        text_file = PROCESSED / "text" / row.source_id / f"{snapshot_stem}.txt"
        assert raw.exists(), f"{row.fact_id}: raw snapshot {raw} missing"
        assert text_file.exists(), f"{row.fact_id}: extracted text missing; run extract_text.py"
        if squash(row.evidence) not in squash(text_file.read_text(encoding="utf-8")):
            missing.append(row.fact_id)
    assert not missing, f"Evidence not found in source text for: {missing}"
