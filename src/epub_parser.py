"""
EPUB parsing: turn a .epub file into an ordered list of chapters
with clean text content.

EPUBs are zip archives of XHTML files plus a manifest. We walk the
spine (the canonical reading order), strip HTML, and filter out
front/back matter that isn't really a chapter (copyright pages,
acknowledgments, etc. — heuristic: very short documents).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from bs4 import BeautifulSoup
from ebooklib import epub, ITEM_DOCUMENT


@dataclass
class Chapter:
    number: int
    title: str
    text: str
    word_count: int


# Documents under this word count are treated as front/back matter, not chapters.
# Tune this if you find the threshold cutting real chapters or letting
# in too much chaff. 500 is a reasonable default for trade non-fiction.
MIN_CHAPTER_WORDS = 500


def parse_epub(epub_path: Path) -> tuple[dict, list[Chapter]]:
    """
    Parse an EPUB and return (metadata, chapters).

    metadata: { "title": str, "author": str }
    chapters: list of Chapter, in reading order, renumbered starting at 1.
    """
    book = epub.read_epub(str(epub_path), options={"ignore_ncx": True})

    metadata = {
        "title": _first_metadata(book, "title") or epub_path.stem,
        "author": _first_metadata(book, "creator") or "Unknown",
    }

    chapters: list[Chapter] = []
    chapter_num = 0

    for item in book.get_items_of_type(ITEM_DOCUMENT):
        text, title = _extract_text_and_title(item.get_content())
        word_count = len(text.split())

        if word_count < MIN_CHAPTER_WORDS:
            continue

        chapter_num += 1
        chapters.append(
            Chapter(
                number=chapter_num,
                title=title or f"Chapter {chapter_num}",
                text=text,
                word_count=word_count,
            )
        )

    return metadata, chapters


def _first_metadata(book: epub.EpubBook, name: str) -> str | None:
    items = book.get_metadata("DC", name)
    if items:
        return items[0][0]
    return None


def _extract_text_and_title(html_bytes: bytes) -> tuple[str, str | None]:
    """
    Pull plain text + best-guess title from a chapter's XHTML.
    Title heuristic: first <h1>/<h2>/<h3> if present.
    """
    soup = BeautifulSoup(html_bytes, "html.parser")

    title_tag = soup.find(["h1", "h2", "h3"])
    title = title_tag.get_text(strip=True) if title_tag else None

    # Drop nav / footnotes / scripts that don't belong in the body
    for bad in soup(["script", "style", "nav"]):
        bad.decompose()

    text = soup.get_text(separator="\n", strip=True)
    # Collapse runs of blank lines for cleaner prompt input
    lines = [ln for ln in (l.strip() for l in text.splitlines()) if ln]
    return "\n".join(lines), title
