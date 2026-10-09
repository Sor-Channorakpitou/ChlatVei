import csv

import pytest

from detect_changes import detect, fields_touched

LOG_FIELDS = ["source_id", "collected_at", "outcome", "raw_path"]
FACT_FIELDS = ["fact_id", "service_slug", "source_id", "snapshot", "field", "evidence"]


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "data" / "raw" / "S999").mkdir(parents=True)
    (tmp_path / "text").mkdir()
    return tmp_path


def write_csv(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def snapshot(repo, name, html):
    (repo / "data" / "raw" / "S999" / name).write_text(html, encoding="utf-8")
    return f"data/raw/S999/{name}"


def run(repo, log_rows, fact_rows=()):
    write_csv(repo / "log.csv", LOG_FIELDS, log_rows)
    write_csv(repo / "facts.csv", FACT_FIELDS, fact_rows)
    return detect(repo, repo / "log.csv", repo / "facts.csv", repo / "text")


FEE_FACT = {"fact_id": "F9001", "service_slug": "x", "source_id": "S999", "snapshot": "2026-10-08.html",
            "field": "fee", "evidence": "Fee: 30,000 Riels"}
STEP_FACT = {"fact_id": "F9002", "service_slug": "x", "source_id": "S999", "snapshot": "2026-10-08.html",
             "field": "step", "evidence": "Bring your ID card"}


def test_fee_change_is_reported_and_stale_fact_flagged(repo):
    old = snapshot(repo, "2026-10-08.html", "<p>Fee: 30,000 Riels</p><p>Bring your ID card</p>")
    new = snapshot(repo, "2026-11-01.html", "<p>Fee: 50,000 Riels</p><p>Bring your ID card</p>")
    changes = run(repo, [
        {"source_id": "S999", "collected_at": "2026-10-08T00:00:00+00:00", "outcome": "new", "raw_path": old},
        {"source_id": "S999", "collected_at": "2026-10-09T00:00:00+00:00", "outcome": "unchanged", "raw_path": ""},
        {"source_id": "S999", "collected_at": "2026-11-01T00:00:00+00:00", "outcome": "changed", "raw_path": new},
    ], [FEE_FACT, STEP_FACT])

    assert len(changes) == 1
    c = changes[0]
    assert (c.previous_snapshot, c.latest_snapshot) == ("2026-10-08.html", "2026-11-01.html")
    assert c.added == ["Fee: 50,000 Riels"] and c.removed == ["Fee: 30,000 Riels"]
    assert "fee" in c.fields_touched
    assert {f.fact_id: f.evidence_still_present for f in c.facts} == {"F9001": False, "F9002": True}


def test_single_snapshot_or_markup_only_change_is_not_reported(repo):
    first = snapshot(repo, "2026-10-08.html", "<p>Same text</p>")
    second = snapshot(repo, "2026-11-01.html", "<div class='new'><p>Same text</p></div>")
    log = [{"source_id": "S999", "collected_at": "2026-10-08T00:00:00+00:00", "outcome": "new", "raw_path": first}]
    assert run(repo, log) == []

    log.append({"source_id": "S999", "collected_at": "2026-11-01T00:00:00+00:00", "outcome": "changed", "raw_path": second})
    assert run(repo, log) == []


def test_khmer_cues_map_to_fields():
    assert fields_touched(["តម្លៃសេវា ៥០.០០០ រៀល"]) == ["fee"]
    assert set(fields_touched(["ឯកសារភ្ជាប់", "រយៈពេល ៣០ ថ្ងៃធ្វើការ"])) == {"required_document", "processing_time"}
