"""Load the Phase 2 dataset (data/metadata, data/processed) into tidy pandas frames."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data"

# Sources that describe a service's content (not just legal background or secondary context).
CONTENT_RELEVANCE = {"primary", "supporting"}


def read_csv(relative: str) -> pd.DataFrame:
    return pd.read_csv(DATA / relative, dtype=str, keep_default_na=False)


@dataclass
class Dataset:
    services: pd.DataFrame
    sources: pd.DataFrame
    service_sources: pd.DataFrame
    facts: pd.DataFrame
    names_km: pd.DataFrame

    @classmethod
    def load(cls) -> "Dataset":
        return cls(
            services=read_csv("metadata/services.csv"),
            sources=read_csv("metadata/sources.csv"),
            service_sources=read_csv("metadata/service_sources.csv"),
            facts=read_csv("processed/annotations/service_facts.csv"),
            names_km=read_csv("metadata/service_names_km.csv"),
        )

    def source_text(self, source_id: str) -> str:
        """Text extracted from the latest snapshot of a source ('' if none was collected)."""
        folder = DATA / "processed" / "text" / source_id
        files = sorted(folder.glob("*.txt")) if folder.exists() else []
        return files[-1].read_text(encoding="utf-8") if files else ""

    def service_documents(self, include_source_text: bool = True) -> pd.DataFrame:
        """One searchable text per service, built only from what ChlatVei actually holds:
        official names, the responsible body, annotated facts, and (optionally) the text
        of the official pages linked to the service. No hand-written synonyms."""
        names_km = dict(zip(self.names_km["service_slug"], self.names_km["name_km"]))
        rows = []
        for svc in self.services.itertuples():
            facts = self.facts[(self.facts["service_slug"] == svc.service_slug) & (self.facts["status"] == "stated")]
            parts = [svc.name_en, names_km.get(svc.service_slug, ""), svc.responsible_body, *facts["value"], *facts["evidence"]]
            if include_source_text:
                links = self.service_sources[
                    (self.service_sources["service_slug"] == svc.service_slug)
                    & (self.service_sources["relevance"].isin(CONTENT_RELEVANCE))
                ]
                parts += [self.source_text(sid) for sid in links["source_id"]]
            rows.append({
                "service_slug": svc.service_slug,
                "name": " ".join(p for p in [svc.name_en, names_km.get(svc.service_slug, "")] if p),
                "text": "\n".join(p for p in parts if p),
            })
        return pd.DataFrame(rows)
