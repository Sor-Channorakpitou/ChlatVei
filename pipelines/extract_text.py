"""Extract plain text from raw source snapshots.

Reads every snapshot under data/raw/<source_id>/ and writes text to
data/processed/text/<source_id>/<snapshot_stem>.txt, plus a per-document
summary at data/processed/documents.csv.

Methods:
  html      - visible text of the page, with scripts/styles/nav/header/footer removed
  pdf_text  - the PDF's embedded text layer
  ocr       - Tesseract OCR (khm+eng) for scanned PDFs with no text layer

Raw files are only read, never modified.

Usage:
    python extract_text.py [--no-ocr]
Environment:
    TESSERACT_CMD  path to the tesseract binary (default: "tesseract" on PATH)
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path

from bs4 import BeautifulSoup
from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"
TEXT_DIR = REPO_ROOT / "data" / "processed" / "text"
DOCUMENTS_CSV = REPO_ROOT / "data" / "processed" / "documents.csv"

TESSERACT_CMD = os.environ.get("TESSERACT_CMD", "tesseract")
OCR_LANGS = "khm+eng"
MIN_TEXT_LAYER_CHARS = 50  # below this a PDF is treated as scanned

NOISE_TAGS = ["script", "style", "noscript", "nav", "header", "footer", "svg", "iframe", "form"]

KHMER_RANGE = ("ក", "៿")


@dataclass
class DocumentRecord:
    source_id: str
    snapshot: str
    method: str
    pages: int
    chars: int
    khmer_char_ratio: float
    text_path: str


def khmer_ratio(text: str) -> float:
    letters = [c for c in text if not c.isspace()]
    if not letters:
        return 0.0
    khmer = sum(KHMER_RANGE[0] <= c <= KHMER_RANGE[1] for c in letters)
    return round(khmer / len(letters), 3)


def normalize_whitespace(text: str) -> str:
    lines = (re.sub(r"[ \t ​]+", " ", line).strip() for line in text.splitlines())
    out, blank = [], False
    for line in lines:
        if line:
            out.append(line)
            blank = False
        elif not blank:
            out.append("")
            blank = True
    return "\n".join(out).strip() + "\n"


def html_to_text(html: bytes) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(NOISE_TAGS):
        tag.decompose()
    return normalize_whitespace(soup.get_text("\n"))


def pdf_text_layer(path: Path) -> tuple[str, int]:
    reader = PdfReader(path)
    text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
    return normalize_whitespace(text), len(reader.pages)


def ocr_pdf(path: Path) -> tuple[str, int]:
    """OCR each page's embedded scan image with Tesseract."""
    reader = PdfReader(path)
    pages_text = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, page in enumerate(reader.pages):
            images = list(page.images)
            if not images:
                pages_text.append("")
                continue
            img_path = Path(tmp) / f"p{i}.png"
            images[0].image.save(img_path)
            result = subprocess.run(
                [TESSERACT_CMD, str(img_path), "stdout", "-l", OCR_LANGS, "--psm", "6"],
                capture_output=True, check=True,
            )
            pages_text.append(result.stdout.decode("utf-8", errors="replace"))
    return normalize_whitespace("\n\n".join(pages_text)), len(reader.pages)


def extract(path: Path, use_ocr: bool) -> tuple[str, str, int]:
    """Return (text, method, pages) for one raw snapshot."""
    suffix = path.suffix.lower()
    if suffix in {".html", ".htm"}:
        return html_to_text(path.read_bytes()), "html", 1
    if suffix == ".pdf":
        text, pages = pdf_text_layer(path)
        if len(text.strip()) >= MIN_TEXT_LAYER_CHARS or not use_ocr:
            return text, "pdf_text", pages
        text, pages = ocr_pdf(path)
        return text, "ocr", pages
    raise ValueError(f"Unsupported snapshot type: {path.name}")


def run(raw_dir: Path, text_dir: Path, use_ocr: bool) -> list[DocumentRecord]:
    records = []
    for snapshot in sorted(raw_dir.glob("*/*")):
        if not snapshot.is_file() or snapshot.name.startswith("."):
            continue
        source_id = snapshot.parent.name
        text, method, pages = extract(snapshot, use_ocr)
        out = text_dir / source_id / f"{snapshot.stem}.txt"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        records.append(DocumentRecord(
            source_id=source_id,
            snapshot=snapshot.name,
            method=method,
            pages=pages,
            chars=len(text.strip()),
            khmer_char_ratio=khmer_ratio(text),
            text_path=out.relative_to(REPO_ROOT).as_posix() if out.is_relative_to(REPO_ROOT) else str(out),
        ))
        print(f"{source_id}  {snapshot.name:<16} {method:<9} {len(text.strip()):>7} chars")
    return records


def write_documents_csv(records: list[DocumentRecord], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(DocumentRecord.__dataclass_fields__))
        writer.writeheader()
        writer.writerows(asdict(r) for r in records)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-ocr", action="store_true", help="skip OCR for scanned PDFs")
    args = parser.parse_args()
    records = run(RAW_DIR, TEXT_DIR, use_ocr=not args.no_ocr)
    write_documents_csv(records, DOCUMENTS_CSV)


if __name__ == "__main__":
    main()
