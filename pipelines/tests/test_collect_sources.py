from datetime import datetime, timezone

import pytest

from collect_sources import FetchResult, collect_one, extension_for, robots_text_allows

SOURCE = {"source_id": "S999", "url": "https://example.gov.kh/page"}


def fixed_now(day: int = 8):
    return lambda: datetime(2026, 10, day, 12, 0, tzinfo=timezone.utc)


def fetcher(body: bytes, status: int = 200, content_type: str = "text/html; charset=UTF-8"):
    return lambda url: FetchResult(final_url=url, status=status, content_type=content_type, body=body)


def allow(_url):
    return True


@pytest.fixture
def raw_dir(tmp_path):
    d = tmp_path / "data" / "raw"
    d.mkdir(parents=True)
    return d


def test_first_collection_writes_snapshot(raw_dir):
    entry = collect_one(SOURCE, raw_dir, fetch=fetcher(b"<p>v1</p>"), check_robots=allow, now=fixed_now())

    assert entry.outcome == "new"
    assert entry.raw_path == "data/raw/S999/2026-10-08.html"
    assert (raw_dir / "S999" / "2026-10-08.html").read_bytes() == b"<p>v1</p>"


def test_unchanged_content_writes_nothing(raw_dir):
    collect_one(SOURCE, raw_dir, fetch=fetcher(b"same"), check_robots=allow, now=fixed_now(8))
    entry = collect_one(SOURCE, raw_dir, fetch=fetcher(b"same"), check_robots=allow, now=fixed_now(9))

    assert entry.outcome == "unchanged"
    assert entry.raw_path == ""
    assert len(list((raw_dir / "S999").iterdir())) == 1


def test_changed_content_adds_new_snapshot_and_keeps_old(raw_dir):
    collect_one(SOURCE, raw_dir, fetch=fetcher(b"v1"), check_robots=allow, now=fixed_now(8))
    entry = collect_one(SOURCE, raw_dir, fetch=fetcher(b"v2"), check_robots=allow, now=fixed_now(9))

    assert entry.outcome == "changed"
    assert (raw_dir / "S999" / "2026-10-08.html").read_bytes() == b"v1"
    assert (raw_dir / "S999" / "2026-10-09.html").read_bytes() == b"v2"


def test_same_day_change_does_not_overwrite(raw_dir):
    collect_one(SOURCE, raw_dir, fetch=fetcher(b"v1"), check_robots=allow, now=fixed_now(8))
    entry = collect_one(SOURCE, raw_dir, fetch=fetcher(b"v2"), check_robots=allow, now=fixed_now(8))

    assert entry.outcome == "changed"
    assert (raw_dir / "S999" / "2026-10-08.html").read_bytes() == b"v1"
    assert entry.raw_path.endswith("2026-10-08T120000.html")


def test_http_error_is_logged_not_saved(raw_dir):
    entry = collect_one(SOURCE, raw_dir, fetch=fetcher(b"nope", status=404), check_robots=allow, now=fixed_now())

    assert entry.outcome == "http_error"
    assert entry.http_status == "404"
    assert not (raw_dir / "S999").exists()


def test_fetch_exception_is_captured(raw_dir):
    def boom(url):
        raise ConnectionError("timed out")

    entry = collect_one(SOURCE, raw_dir, fetch=boom, check_robots=allow, now=fixed_now())

    assert entry.outcome == "fetch_error"
    assert "timed out" in entry.error


def test_robots_disallow_skips_fetch(raw_dir):
    def must_not_fetch(url):
        raise AssertionError("fetch should not be called")

    entry = collect_one(SOURCE, raw_dir, fetch=must_not_fetch, check_robots=lambda u: False, now=fixed_now())

    assert entry.outcome == "blocked_robots"


@pytest.mark.parametrize(
    "content_type,url,expected",
    [
        ("application/pdf", "https://x/doc", ".pdf"),
        ("text/html; charset=UTF-8", "https://x/page", ".html"),
        ("application/octet-stream", "https://x/file.pdf", ".pdf"),
        ("", "https://x/unknown", ".bin"),
    ],
)
def test_extension_for(content_type, url, expected):
    assert extension_for(content_type, url) == expected


def test_robots_rules_are_applied():
    rules = "User-agent: *\nDisallow: /wp-admin/\n"
    assert robots_text_allows(rules, "https://x.gov.kh/services")
    assert not robots_text_allows(rules, "https://x.gov.kh/wp-admin/settings")


def test_robots_comment_only_file_allows():
    assert robots_text_allows("# content signals only\n", "https://x.gov.kh/page")
