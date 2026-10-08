"""Build the service x field coverage table from annotated facts.

For each service and core field, reports:
  stated       - at least one fact quotes the field from an official source
  not_stated   - an annotated source was checked and does not state it
  unannotated  - no source for this service has been annotated yet

Also counts stated items per field (e.g. number of required documents), which
later feed the complexity features. Output: data/processed/field_coverage.csv
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICES_CSV = REPO_ROOT / "data" / "metadata" / "services.csv"
FACTS_CSV = REPO_ROOT / "data" / "processed" / "annotations" / "service_facts.csv"
OUTPUT_CSV = REPO_ROOT / "data" / "processed" / "field_coverage.csv"

CORE_FIELDS = [
    "eligibility", "required_document", "step", "fee",
    "processing_time", "location", "contact",
]


def field_status(rows: pd.DataFrame) -> str:
    if rows.empty:
        return "unannotated"
    return "stated" if (rows["status"] == "stated").any() else "not_stated"


def build_coverage(services: pd.DataFrame, facts: pd.DataFrame) -> pd.DataFrame:
    records = []
    for slug in services["service_slug"]:
        service_facts = facts[facts["service_slug"] == slug]
        annotated = not service_facts.empty
        record = {"service_slug": slug}
        for field in CORE_FIELDS:
            rows = service_facts[service_facts["field"] == field]
            if annotated and rows.empty:
                status = "not_stated"
            else:
                status = field_status(rows)
            record[f"{field}_status"] = status
            record[f"{field}_count"] = int((rows["status"] == "stated").sum())
        stated = sum(record[f"{f}_status"] == "stated" for f in CORE_FIELDS)
        record["completeness"] = round(stated / len(CORE_FIELDS), 3) if annotated else None
        records.append(record)
    return pd.DataFrame(records)


def main() -> None:
    services = pd.read_csv(SERVICES_CSV, dtype=str, keep_default_na=False)
    facts = pd.read_csv(FACTS_CSV, dtype=str, keep_default_na=False)
    coverage = build_coverage(services, facts)
    coverage.to_csv(OUTPUT_CSV, index=False)
    cols = ["service_slug", "completeness"] + [f"{f}_status" for f in CORE_FIELDS]
    print(coverage[cols].to_string(index=False))


if __name__ == "__main__":
    main()
