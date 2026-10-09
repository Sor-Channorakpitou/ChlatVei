from extract_text import html_to_text, khmer_ratio, normalize_whitespace, run


def test_html_to_text_drops_noise_and_keeps_content():
    html = b"""
    <html><head><style>p{color:red}</style><script>var x=1;</script></head>
    <body><nav>Home | About</nav><header>Banner</header>
    <main><h1>Driver's License</h1><p>Required documents</p></main>
    <footer>Copyright</footer></body></html>
    """
    text = html_to_text(html)

    assert "Driver's License" in text
    assert "Required documents" in text
    for noise in ("var x", "color:red", "Home | About", "Banner", "Copyright"):
        assert noise not in text


def test_normalize_whitespace_collapses_runs_and_blank_lines():
    assert normalize_whitespace("a  \t b\n\n\n\nc  d\n") == "a b\n\nc d\n"


def test_khmer_ratio():
    assert khmer_ratio("") == 0.0
    assert khmer_ratio("abc") == 0.0
    assert khmer_ratio("ខ្មែរ") == 1.0
    assert 0 < khmer_ratio("ខ្មែរ abc") < 1


def test_run_writes_text_and_never_touches_raw(tmp_path):
    raw = tmp_path / "raw" / "S001"
    raw.mkdir(parents=True)
    snapshot = raw / "2026-10-08.html"
    original = b"<html><body><p>\xe1\x9e\x9f\xe1\x9f\x81\xe1\x9e\x9c\xe1\x9e\xb6 fee</p></body></html>"
    snapshot.write_bytes(original)

    records = run(tmp_path / "raw", tmp_path / "text", use_ocr=False)

    assert snapshot.read_bytes() == original
    assert len(records) == 1
    assert records[0].method == "html"
    assert (tmp_path / "text" / "S001" / "2026-10-08.txt").read_text(encoding="utf-8").strip() == "សេវា fee"
