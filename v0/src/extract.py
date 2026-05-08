"""
Entrypoint: python src/extract.py path/to/book.epub [--chapters 1-10]

Parses the EPUB, runs Claude extraction on each chapter, writes one
JSON file to output/ with the full result.

--chapters accepts a range (1-10), a list (1,3,5), or both (1-5,8).
When used, only those chapters are re-extracted and merged back into
the existing output file (other chapters are preserved).

No DB, no caching, no fancy concurrency. v0 keeps it simple.
"""

from __future__ import annotations

import argparse
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


def parse_chapter_range(s: str) -> set[int]:
    nums: set[int] = set()
    for part in s.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            nums.update(range(int(a), int(b) + 1))
        else:
            nums.add(int(part))
    return nums


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract chapters from an EPUB.")
    parser.add_argument("epub", help="Path to the EPUB file")
    parser.add_argument(
        "--chapters",
        help="Chapter range to (re-)extract, e.g. '1-10' or '1,3,5' or '1-5,8'",
    )
    args = parser.parse_args()

    epub_path = Path(args.epub)
    if not epub_path.exists():
        print(f"File not found: {epub_path}", file=sys.stderr)
        return 1

    chapter_filter: set[int] | None = None
    if args.chapters:
        chapter_filter = parse_chapter_range(args.chapters)

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

    if chapter_filter:
        chapters = [ch for ch in chapters if ch.number in chapter_filter]
        print(f"  Extracting: chapters {sorted(chapter_filter)}")
    print()

    started = time.time()
    failed: list[int] = []
    newly_extracted: list[dict] = []

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
            newly_extracted.append({
                "chapter_number": ch.number,
                "title": ch.title,
                "word_count": ch.word_count,
                "extraction": extraction,
            })
        except ExtractionError as e:
            print(f"FAILED")
            print(f"      {e}")
            failed.append(ch.number)
            newly_extracted.append({
                "chapter_number": ch.number,
                "title": ch.title,
                "word_count": ch.word_count,
                "extraction": None,
                "error": str(e),
            })

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{slugify(metadata['title'])}.json"

    if chapter_filter and out_path.exists():
        # Merge: keep existing chapters, replace only the re-extracted ones.
        existing = json.loads(out_path.read_text())
        by_num = {c["chapter_number"]: i for i, c in enumerate(existing["chapters"])}
        for new_ch in newly_extracted:
            num = new_ch["chapter_number"]
            if num in by_num:
                existing["chapters"][by_num[num]] = new_ch
            else:
                existing["chapters"].append(new_ch)
        existing["chapters"].sort(key=lambda c: c["chapter_number"])
        out_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    else:
        results = {
            "title": metadata["title"],
            "author": metadata["author"],
            "source_file": epub_path.name,
            "chapter_count": len(newly_extracted),
            "chapters": newly_extracted,
        }
        out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    total_elapsed = time.time() - started
    print()
    print(f"Wrote {out_path}")
    if newly_extracted:
        print(f"Total time: {total_elapsed:.1f}s ({total_elapsed/len(newly_extracted):.1f}s/chapter avg)")
    if failed:
        print(f"Failed chapters: {failed}")

    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
