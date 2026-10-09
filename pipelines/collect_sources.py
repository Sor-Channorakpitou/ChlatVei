"""Collect raw snapshots of registered public-service sources.

Reads data/metadata/sources.csv, downloads each URL, and stores an unmodified
snapshot at data/raw/<source_id>/<YYYY-MM-DD>.<ext>. Every attempt is appended
to data/metadata/collection_log.csv with its SHA-256 so content changes can be
detected later.

Raw snapshots are never overwritten: if content is unchanged since the latest
snapshot nothing is written; if it changed, a new dated file is added.

Usage:
    python collect_sources.py                 # all sources
    python collect_sources.py --only S001 S004
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib import robotparser
from urllib.parse import urlsplit

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCES_CSV = REPO_ROOT / "data" / "metadata" / "sources.csv"
LOG_CSV = REPO_ROOT / "data" / "metadata" / "collection_log.csv"
RAW_DIR = REPO_ROOT / "data" / "raw"

USER_AGENT = "ChlatVei-collector/0.1 (+https://github.com/Sor-Channorakpitou/ChlatVei)"
REQUEST_DELAY_SECONDS = 2.0
TIMEOUT_SECONDS = 30

LOG_FIELDS = [
    "source_id", "collected_at", "url", "final_url", "outcome", "http_status",
    "content_type", "bytes", "sha256", "raw_path", "error",
]

EXTENSIONS = {
    "application/pdf": ".pdf",
    "text/html": ".html",
    "application/xhtml+xml": ".html",
    "application/json": ".json",
    "text/plain": ".txt",
}


@dataclass
class FetchResult:
    final_url: str
    status: int
    content_type: str
    body: bytes


@dataclass
class LogEntry:
    source_id: str
    collected_at: str
    url: str
    final_url: str = ""
    outcome: str = ""  # new | changed | unchanged | blocked_robots | http_error | fetch_error
    http_status: str = ""
    content_type: str = ""
    bytes: str = ""
    sha256: str = ""
    raw_path: str = ""
    error: str = ""


Fetcher = Callable[[str], FetchResult]


def http_fetch(url: str) -> FetchResult:
    resp = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/pdf,*/*;q=0.8"},
        timeout=TIMEOUT_SECONDS,
        allow_redirects=True,
    )
    return FetchResult(
        final_url=resp.url,
        status=resp.status_code,
        content_type=resp.headers.get("Content-Type", ""),
        body=resp.content,
    )


def robots_allows(url: str) -> bool:
    """Respect robots.txt following RFC 9309.

    4xx means no robots.txt (allow); 5xx or a network error means unreachable
    (disallow). A non-text response (e.g. a bot-challenge page) is treated as
    unreachable rather than parsed as rules.
    """
    parts = urlsplit(url)
    try:
        resp = requests.get(
            f"{parts.scheme}://{parts.netloc}/robots.txt",
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False
    if 400 <= resp.status_code < 500:
        return True
    if resp.status_code >= 500 or not resp.headers.get("Content-Type", "").startswith("text/plain"):
        return False
    return robots_text_allows(resp.text, url)


def robots_text_allows(robots_txt: str, url: str) -> bool:
    parser = robotparser.RobotFileParser()
    parser.parse(robots_txt.splitlines())
    return parser.can_fetch(USER_AGENT, url)


def extension_for(content_type: str, url: str) -> str:
    mime = content_type.split(";")[0].strip().lower()
    if mime in EXTENSIONS:
        return EXTENSIONS[mime]
    suffix = Path(urlsplit(url).path).suffix.lower()
    return suffix if suffix in {".pdf", ".html", ".htm", ".json", ".txt"} else ".bin"


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def latest_snapshot_hash(source_dir: Path) -> str | None:
    snapshots = sorted(p for p in source_dir.glob("*") if p.is_file())
    return sha256_of(snapshots[-1].read_bytes()) if snapshots else None


def snapshot_path(source_dir: Path, collected: datetime, ext: str) -> Path:
    """Dated filename; adds a time suffix if a snapshot already exists for that day."""
    path = source_dir / f"{collected:%Y-%m-%d}{ext}"
    if path.exists():
        path = source_dir / f"{collected:%Y-%m-%dT%H%M%S}{ext}"
    return path


def collect_one(
    source: dict,
    raw_dir: Path,
    fetch: Fetcher = http_fetch,
    check_robots: Callable[[str], bool] = robots_allows,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> LogEntry:
    collected = now()
    entry = LogEntry(source_id=source["source_id"], collected_at=collected.isoformat(), url=source["url"])

    if not check_robots(source["url"]):
        entry.outcome = "blocked_robots"
        return entry

    try:
        result = fetch(source["url"])
    except Exception as exc:  # network errors, timeouts, too many redirects
        entry.outcome = "fetch_error"
        entry.error = f"{type(exc).__name__}: {exc}"[:300]
        return entry

    entry.final_url = result.final_url
    entry.http_status = str(result.status)
    entry.content_type = result.content_type
    entry.bytes = str(len(result.body))

    if result.status >= 400:
        entry.outcome = "http_error"
        return entry

    digest = sha256_of(result.body)
    entry.sha256 = digest
    source_dir = raw_dir / source["source_id"]
    previous = latest_snapshot_hash(source_dir) if source_dir.exists() else None

    if previous == digest:
        entry.outcome = "unchanged"
        return entry

    source_dir.mkdir(parents=True, exist_ok=True)
    path = snapshot_path(source_dir, collected, extension_for(result.content_type, result.final_url))
    path.write_bytes(result.body)
    entry.raw_path = path.relative_to(raw_dir.parent.parent).as_posix()
    entry.outcome = "new" if previous is None else "changed"
    return entry


def append_log(entries: list[LogEntry], log_csv: Path) -> None:
    write_header = not log_csv.exists()
    with log_csv.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        if write_header:
            writer.writeheader()
        for e in entries:
            writer.writerow(asdict(e))


def load_sources(sources_csv: Path) -> list[dict]:
    with sources_csv.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="*", help="source_ids to collect")
    args = parser.parse_args()

    sources = load_sources(SOURCES_CSV)
    if args.only:
        sources = [s for s in sources if s["source_id"] in set(args.only)]

    entries = []
    for i, source in enumerate(sources):
        if i:
            time.sleep(REQUEST_DELAY_SECONDS)
        entry = collect_one(source, RAW_DIR)
        entries.append(entry)
        print(f"{entry.source_id}  {entry.outcome:<15} {entry.http_status:>4}  {entry.raw_path or entry.error}")

    append_log(entries, LOG_CSV)


if __name__ == "__main__":
    main()
