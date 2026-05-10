"""
PDF parsing: turn a .pdf file into an ordered list of chapters.

PDFs have no native chapter structure, so we heuristically detect chapter
boundaries by scanning the first few lines of each page for common heading
patterns (e.g. "Chapter 1", "CHAPTER ONE", "I. Introduction"). If no
headings are found we fall back to grouping pages into fixed-size chunks.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import fitz  # pymupdf


@dataclass
class Chapter:
    number: int
    title: str
    text: str
    word_count: int


MIN_CHAPTER_WORDS = 500
DEFAULT_PAGES_PER_CHUNK = 20

_CHAPTER_RE = re.compile(
    r"^(?:chapter\s+[\dIVXivx]+|[\dIVXivx]+\.\s+\S)",
    re.IGNORECASE,
)


def parse_pdf(pdf_path: Path) -> tuple[dict, list[Chapter]]:
    """
    Parse a PDF and return (metadata, chapters).

    metadata: { "title": str, "author": str }
    chapters: list of Chapter, in reading order, numbered starting at 1.
    """
    doc = fitz.open(str(pdf_path))

    meta = doc.metadata
    metadata = {
        "title": (meta.get("title") or "").strip() or pdf_path.stem,
        "author": (meta.get("author") or "").strip() or "Unknown",
    }

    pages = [page.get_text() for page in doc]
    doc.close()

    chapters = _split_into_chapters(pages)
    return metadata, chapters


def _split_into_chapters(pages: list[str]) -> list[Chapter]:
    boundaries = _detect_chapter_boundaries(pages)

    if not boundaries:
        boundaries = list(range(0, len(pages), DEFAULT_PAGES_PER_CHUNK))

    segments: list[tuple[list[str]]] = []
    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else len(pages)
        segments.append(pages[start:end])

    chapters: list[Chapter] = []
    chapter_num = 0
    for page_texts in segments:
        text = _clean("\n".join(page_texts))
        word_count = len(text.split())
        if word_count < MIN_CHAPTER_WORDS:
            continue
        chapter_num += 1
        title = _first_line(page_texts[0]) if page_texts else None
        chapters.append(
            Chapter(
                number=chapter_num,
                title=title or f"Section {chapter_num}",
                text=text,
                word_count=word_count,
            )
        )

    return chapters


def _detect_chapter_boundaries(pages: list[str]) -> list[int]:
    boundaries: list[int] = []
    for i, page in enumerate(pages):
        first_lines = [ln.strip() for ln in page.splitlines() if ln.strip()][:5]
        if any(_CHAPTER_RE.match(ln) for ln in first_lines):
            boundaries.append(i)
    return boundaries


def _first_line(page_text: str) -> str | None:
    for line in page_text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped[:120]
    return None


def _clean(text: str) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines)
