"""Detect content changes between the two latest snapshots of each source (spec §24).

collect_sources.py stores a new dated snapshot only when a source's SHA-256
changes. This script compares each source's latest snapshot with the one before
it and reports, for admin review:

- the lines added and removed (on extracted text, so markup churn is ignored),
- which fields the changed lines look like they touch (fee, required_document,
  step, processing_time, eligibility), using simple Khmer and English cues,
- which annotated facts quoted the previous snapshot, and whether their quoted
  evidence still appears in the new one.

It never edits facts or their review status: every change goes to a person.

Usage:
    python detect_changes.py                 # all sources with 2+ snapshots
    python detect_changes.py --only S001 S004
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
from dataclasses import dataclass, field, asdict
from datetime import date
from pathlib import Path

from extract_text import extract

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_CSV = REPO_ROOT / "data" / "metadata" / "collection_log.csv"
FACTS_CSV = REPO_ROOT / "data" / "processed" / "annotations" / "service_facts.csv"
TEXT_DIR = REPO_ROOT / "data" / "processed" / "text"
REPORT_DIR = REPO_ROOT / "data" / "processed" / "change_reports"

SNAPSHOT_OUTCOMES = {"new", "changed"}
MAX_LINES_PER_SIDE = 200

# Cues are deliberately broad: a false flag costs a reviewer a glance, a missed one costs a citizen.
FIELD_CUES = {
    "fee": ["រៀល", "ដុល្លារ", "តម្លៃ", "កម្រៃ", "ថ្លៃ", "riel", "usd", "$", "fee", "price", "cost"],
    "required_document": ["ឯកសារ", "លិខិត", "សំបុត្រ", "ច្បាប់ចម្លង", "រូបថត", "document", "certificate", "copy", "photo"],
    "step": ["ជំហាន", "ដាក់ពាក្យ", "នីតិវិធី", "step", "procedure", "apply", "submit"],
    "processing_time": ["ថ្ងៃធ្វើការ", "រយៈពេល", "ម៉ោង", "សប្តាហ៍", "working day", "days", "hours", "weeks"],
    "eligibility": ["អាយុ", "លក្ខខណ្ឌ", "សញ្ជាតិ", "age", "eligib", "citizen", "nationality"],
}


@dataclass
class FactCheck:
    fact_id: str
    service_slug: str
    field: str
    evidence_still_present: bool


@dataclass
class SourceChange:
    source_id: str
    previous_snapshot: str
    latest_snapshot: str
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    fields_touched: list[str] = field(default_factory=list)
    facts: list[FactCheck] = field(default_factory=list)

    @property
    def needs_review(self) -> bool:
        return bool(self.added or self.removed)


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def snapshot_history(log_csv: Path) -> dict[str, list[str]]:
    """source_id -> raw_paths of stored snapshots, oldest first."""
    history: dict[str, list[tuple[str, str]]] = {}
    with log_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["outcome"] in SNAPSHOT_OUTCOMES and row["raw_path"]:
                history.setdefault(row["source_id"], []).append((row["collected_at"], row["raw_path"]))
    return {sid: [p for _, p in sorted(rows)] for sid, rows in history.items()}


def snapshot_text(raw_path: Path, text_dir: Path) -> str:
    """Prefer the committed extraction (it may include OCR); fall back to extracting now."""
    cached = text_dir / raw_path.parent.name / f"{raw_path.stem}.txt"
    if cached.exists():
        return cached.read_text(encoding="utf-8")
    text, _, _ = extract(raw_path, use_ocr=False)
    return text


def fields_touched(lines: list[str]) -> list[str]:
    joined = "\n".join(lines).lower()
    return [name for name, cues in FIELD_CUES.items() if any(cue in joined for cue in cues)]


def diff_lines(old: str, new: str) -> tuple[list[str], list[str]]:
    old_lines = [line for line in old.splitlines() if line.strip()]
    new_lines = [line for line in new.splitlines() if line.strip()]
    added, removed = [], []
    for line in difflib.ndiff(old_lines, new_lines):
        if line.startswith("+ "):
            added.append(line[2:])
        elif line.startswith("- "):
            removed.append(line[2:])
    return added, removed


def load_facts(facts_csv: Path) -> list[dict]:
    with facts_csv.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def compare_source(source_id: str, previous: Path, latest: Path, facts: list[dict], text_dir: Path) -> SourceChange:
    old_text = snapshot_text(previous, text_dir)
    new_text = snapshot_text(latest, text_dir)
    added, removed = diff_lines(old_text, new_text)
    change = SourceChange(
        source_id=source_id,
        previous_snapshot=previous.name,
        latest_snapshot=latest.name,
        added=added[:MAX_LINES_PER_SIDE],
        removed=removed[:MAX_LINES_PER_SIDE],
        fields_touched=fields_touched(added + removed),
    )
    new_squashed = squash(new_text)
    for fact in facts:
        if fact["source_id"] == source_id and fact["snapshot"] == previous.name and fact["evidence"]:
            change.facts.append(FactCheck(
                fact_id=fact["fact_id"],
                service_slug=fact["service_slug"],
                field=fact["field"],
                evidence_still_present=squash(fact["evidence"]) in new_squashed,
            ))
    return change


def detect(repo_root: Path, log_csv: Path, facts_csv: Path, text_dir: Path, only: set[str] | None = None) -> list[SourceChange]:
    facts = load_facts(facts_csv) if facts_csv.exists() else []
    changes = []
    for source_id, paths in sorted(snapshot_history(log_csv).items()):
        if len(paths) < 2 or (only and source_id not in only):
            continue
        change = compare_source(source_id, repo_root / paths[-2], repo_root / paths[-1], facts, text_dir)
        if change.needs_review:
            changes.append(change)
    return changes


def write_report(changes: list[SourceChange], report_dir: Path, day: date) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    path = report_dir / f"{day.isoformat()}.json"
    path.write_text(json.dumps([asdict(c) for c in changes], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="*", help="source_ids to compare")
    args = parser.parse_args()

    changes = detect(REPO_ROOT, LOG_CSV, FACTS_CSV, TEXT_DIR, set(args.only) if args.only else None)
    if not changes:
        print("No content changes between the latest snapshots.")
        return
    for c in changes:
        stale = [f.fact_id for f in c.facts if not f.evidence_still_present]
        print(
            f"{c.source_id}  {c.previous_snapshot} -> {c.latest_snapshot}  +{len(c.added)}/-{len(c.removed)} lines"
            f"  fields: {', '.join(c.fields_touched) or '-'}  facts to re-check: {', '.join(stale) or '-'}"
        )
    print(f"Report: {write_report(changes, REPORT_DIR, date.today()).relative_to(REPO_ROOT).as_posix()}")


if __name__ == "__main__":
    main()
