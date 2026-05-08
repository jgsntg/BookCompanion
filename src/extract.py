"""
Entrypoint: python src/extract.py path/to/book.epub

Parses the EPUB, runs Claude extraction on each chapter, writes one
JSON file to output/ with the full result.

No DB, no caching, no fancy concurrency. v0 keeps it simple.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

# Make src/ importable when run as `python src/extract.py ...`
sys.path.insert(0, str(Path(__file__).parent))

from epub_parser import parse_epub
from extractor import extract_chapter, ExtractionError


OUTPUT_DIR = Path(__file__).parent.parent / "output"


def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", text).strip("-")[:80]


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python src/extract.py path/to/book.epub", file=sys.stderr)
        return 1

    epub_path = Path(sys.argv[1])
    if not epub_path.exists():
        print(f"File not found: {epub_path}", file=sys.stderr)
        return 1

    load_dotenv()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set (check .env)", file=sys.stderr)
        return 1

    client = Anthropic(api_key=api_key)

    print(f"Parsing {epub_path.name}...")
    metadata, chapters = parse_epub(epub_path)
    print(f"  Title:    {metadata['title']}")
    print(f"  Author:   {metadata['author']}")
    print(f"  Chapters: {len(chapters)}")
    print()

    results = {
        "title": metadata["title"],
        "author": metadata["author"],
        "source_file": epub_path.name,
        "chapter_count": len(chapters),
        "chapters": [],
    }

    started = time.time()
    failed: list[int] = []

    for ch in chapters:
        print(f"  [{ch.number:>2}/{len(chapters)}] {ch.title} ({ch.word_count:,} words)... ", end="", flush=True)
        t0 = time.time()
        try:
            extraction = extract_chapter(
                client,
                title=metadata["title"],
                author=metadata["author"],
                chapter_number=ch.number,
                chapter_title=ch.title,
                chapter_text=ch.text,
            )
            elapsed = time.time() - t0
            print(f"done ({elapsed:.1f}s)")
            results["chapters"].append({
                "chapter_number": ch.number,
                "title": ch.title,
                "word_count": ch.word_count,
                "extraction": extraction,
            })
        except ExtractionError as e:
            print(f"FAILED")
            print(f"      {e}")
            failed.append(ch.number)
            results["chapters"].append({
                "chapter_number": ch.number,
                "title": ch.title,
                "word_count": ch.word_count,
                "extraction": None,
                "error": str(e),
            })

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{slugify(metadata['title'])}.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    total_elapsed = time.time() - started
    print()
    print(f"Wrote {out_path}")
    print(f"Total time: {total_elapsed:.1f}s ({total_elapsed/len(chapters):.1f}s/chapter avg)")
    if failed:
        print(f"Failed chapters: {failed}")

    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
