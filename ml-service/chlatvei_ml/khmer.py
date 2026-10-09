"""Small helpers for Khmer text.

Written Khmer has no spaces between words, and its vowel signs and subscript
consonants are combining marks. Generic word tokenizers therefore split Khmer
in the wrong places, which is why the search experiments compare word and
character n-gram features.
"""

import re
import unicodedata

KHMER_BLOCK = re.compile(r"[ក-៿]")
_INVISIBLE = re.compile(r"[​‌‍﻿]")  # zero-width space/joiners often found in Khmer web text
_KHMER_DIGITS = str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789")


def is_khmer(text: str) -> bool:
    return bool(KHMER_BLOCK.search(text))


def khmer_ratio(text: str) -> float:
    letters = [c for c in text if not c.isspace()]
    return sum(bool(KHMER_BLOCK.match(c)) for c in letters) / len(letters) if letters else 0.0


def normalize(text: str) -> str:
    """NFC-normalize, drop zero-width characters, convert Khmer digits, lower-case Latin, squash spaces."""
    text = unicodedata.normalize("NFC", text)
    text = _INVISIBLE.sub("", text)
    text = text.translate(_KHMER_DIGITS)
    return re.sub(r"\s+", " ", text).strip().lower()


def query_language(text: str) -> str:
    """'km', 'en' or 'mixed', based on which scripts occur."""
    has_km = is_khmer(text)
    has_latin = bool(re.search(r"[A-Za-z]", text))
    if has_km and has_latin:
        return "mixed"
    return "km" if has_km else "en"
