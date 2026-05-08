"""
Title+author normalization for dedupe.
Mirror of web/lib/dedupe.ts — keep them in sync.
"""

from __future__ import annotations

import re


def _normalize(s: str) -> str:
    s = s.lower().replace("&", "and")
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _normalize_author(raw: str) -> str:
    s = raw.strip()
    if "," in s and s.count(",") == 1:
        last, first = (p.strip() for p in s.split(","))
        if last and first:
            s = f"{first} {last}"
    return _normalize(s)


def make_dedupe_key(title: str, author: str) -> str:
    return f"{_normalize(title)}::{_normalize_author(author)}"
