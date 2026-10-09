import pandas as pd

from coverage import CORE_FIELDS, build_coverage


def facts_frame(rows):
    return pd.DataFrame(rows, columns=["service_slug", "field", "status"])


def test_coverage_distinguishes_stated_not_stated_and_unannotated():
    services = pd.DataFrame({"service_slug": ["a", "b"]})
    facts = facts_frame([
        ("a", "fee", "stated"),
        ("a", "required_document", "stated"),
        ("a", "required_document", "stated"),
        ("a", "processing_time", "not_stated"),
    ])

    cov = build_coverage(services, facts).set_index("service_slug")

    assert cov.loc["a", "fee_status"] == "stated"
    assert cov.loc["a", "required_document_count"] == 2
    assert cov.loc["a", "processing_time_status"] == "not_stated"
    # annotated service, field never mentioned -> treated as not stated
    assert cov.loc["a", "eligibility_status"] == "not_stated"
    assert cov.loc["a", "completeness"] == round(2 / len(CORE_FIELDS), 3)
    # service with no annotations at all
    assert cov.loc["b", "fee_status"] == "unannotated"
    assert pd.isna(cov.loc["b", "completeness"])
