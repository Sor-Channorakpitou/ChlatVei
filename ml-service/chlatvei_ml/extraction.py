"""Rule-based information extraction baseline (RQ2).

Extracts fees and required documents from the text of an official page, then
scores the output field by field against the hand-labelled Phase 2 facts.
Any later ML or LLM extractor must beat these numbers on the same gold data.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

import pandas as pd

from .khmer import normalize

# 30,000 Riels · 125,000 riels · ៣០០០០៛ · 180.000៛ · 95,000 ៛
# Latin or Khmer digits, matched on the ORIGINAL text so evidence stays a verbatim quote.
_DIGIT = "[0-9០-៩]"
_AMOUNT = rf"({_DIGIT}{{1,3}}(?:[.,]{_DIGIT}{{3}})+|{_DIGIT}+)"
FEE_PATTERN = re.compile(_AMOUNT + r"\s*(riels?|៛|khr)", re.IGNORECASE)
USD_PATTERN = re.compile(r"(?:\$\s*" + _AMOUNT + r"|" + _AMOUNT + r"\s*(?:usd|us\$|dollars?))", re.IGNORECASE)

# Lines that introduce a list of documents, in English and Khmer.
DOC_HEADINGS = re.compile(r"(documents?|ឯកសារ).{0,250}(:|៖|include|ត្រូវមាន|ដូចជា)", re.IGNORECASE)
# Lines that end a list: another heading, a contact block, or a long sentence.
LIST_END = re.compile(r"(for information|support|fees?:|frequently asked|តម្លៃ|^the cost|^\d+$)", re.IGNORECASE)


@dataclass
class Extraction:
    fees: list[dict] = field(default_factory=list)  # {"amount": int, "currency": "KHR"|"USD", "text": str}
    documents: list[str] = field(default_factory=list)
    confidence: float = 0.0


def parse_amount(raw: str) -> int:
    """'30,000', '180.000' or '៣០០០០' (Khmer pages use '.' as a thousands separator) → 30000 / 180000 / 30000."""
    return int(re.sub(r"[.,]", "", raw).translate(str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789")))


def extract_fees(text: str) -> list[dict]:
    """Fee amounts with the exact source wording as `text` (used as evidence, so never normalized)."""
    text = unicodedata.normalize("NFC", text)
    found: dict[tuple[int, str], dict] = {}
    for m in FEE_PATTERN.finditer(text):
        amount = parse_amount(m.group(1))
        found.setdefault((amount, "KHR"), {"amount": amount, "currency": "KHR", "text": m.group(0)})
    for m in USD_PATTERN.finditer(text):
        amount = parse_amount(m.group(1) or m.group(2))
        found.setdefault((amount, "USD"), {"amount": amount, "currency": "USD", "text": m.group(0)})
    return list(found.values())


def extract_documents(text: str, max_items: int = 12) -> list[str]:
    """Short lines that follow a 'documents …:' heading, until the list visibly ends."""
    lines = [l.strip() for l in text.splitlines()]
    docs: list[str] = []
    i = 0
    while i < len(lines):
        if DOC_HEADINGS.search(lines[i]) and len(lines[i]) < 250:
            j = i + 1
            while j < len(lines) and len(docs) < max_items * 4:
                line = lines[j]
                if not line:
                    j += 1
                    continue
                if LIST_END.search(line) or DOC_HEADINGS.search(line) or len(line) > 200:
                    break
                docs.append(line)
                j += 1
            i = j
        else:
            i += 1
    # De-duplicate while keeping order
    seen, out = set(), []
    for d in docs:
        key = normalize(d)
        if key not in seen:
            seen.add(key)
            out.append(d)
    return out


def extract(text: str) -> Extraction:
    fees = extract_fees(text)
    documents = extract_documents(text)
    # A rough, rule-based confidence: how many target fields were found at all.
    confidence = (bool(fees) + bool(documents)) / 2
    return Extraction(fees=fees, documents=documents, confidence=confidence)


# ─── Evaluation against the Phase 2 gold facts ─────────────────────────────


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^\w]+", normalize(text)) if len(t) > 1}


def document_matches(predicted: str, gold: str, threshold: float = 0.5) -> bool:
    """Token overlap (Jaccard) between a predicted line and a gold document, either language.

    Khmer words are not space-separated, so for Khmer we fall back to substring containment.
    """
    p, g = normalize(predicted), normalize(gold)
    if g and (g in p or p in g):
        return True
    a, b = _tokens(p), _tokens(g)
    return bool(a and b) and len(a & b) / len(a | b) >= threshold


def prf(tp: int, n_pred: int, n_gold: int) -> dict[str, float]:
    precision = tp / n_pred if n_pred else 0.0
    recall = tp / n_gold if n_gold else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"tp": tp, "predicted": n_pred, "gold": n_gold, "precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3)}


def evaluate_source(source_id: str, text: str, facts: pd.DataFrame) -> pd.DataFrame:
    """Field-level precision/recall/F1 for one source document."""
    gold = facts[(facts["source_id"] == source_id) & (facts["status"] == "stated")]
    result = extract(text)
    rows = []

    gold_fees = {int(a) for a in gold.loc[gold["field"] == "fee", "amount"] if a}
    pred_fees = {f["amount"] for f in result.fees if f["currency"] == "KHR"}
    rows.append({"source_id": source_id, "field": "fee", **prf(len(gold_fees & pred_fees), len(pred_fees), len(gold_fees))})

    gold_docs = gold[gold["field"] == "required_document"]
    gold_texts = [(row.value, row.evidence) for row in gold_docs.itertuples()]
    matched_gold = {
        i for i, (value, evidence) in enumerate(gold_texts)
        if any(document_matches(p, value) or document_matches(p, evidence) for p in result.documents)
    }
    matched_pred = sum(
        any(document_matches(p, v) or document_matches(p, e) for v, e in gold_texts) for p in result.documents
    )
    row = prf(len(matched_gold), len(result.documents), len(gold_texts))
    row["precision"] = round(matched_pred / len(result.documents), 3) if result.documents else 0.0
    p, r = row["precision"], row["recall"]
    row["f1"] = round(2 * p * r / (p + r), 3) if p + r else 0.0
    rows.append({"source_id": source_id, "field": "required_document", **row})
    return pd.DataFrame(rows)
