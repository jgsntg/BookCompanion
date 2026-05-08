"""
Entrypoint:
    python src/extract.py path/to/book.epub                  # auto-detect type
    python src/extract.py path/to/book.epub --type fiction
    python src/extract.py path/to/book.epub --type nonfiction
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

sys.path.insert(0, str(Path(__file__).parent))

from epub_parser import parse_epub
from extractor import extract_chapter, ExtractionError
from detect_book_type import detect_book_type


OUTPUT_DIR = Path(__file__).parent.parent / "output"


def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", text).strip("-")[:80]


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract structured notes from an EPUB.")
    parser.add_argument("epub_path", type=Path, help="Path to the EPUB file.")
    parser.add_argument(
        "--type",
        dest="book_type",
        choices=["fiction", "nonfiction"],
        default=None,
        help="Override auto-detection. If omitted, the book type is detected from the opening.",
    )
    args = parser.parse_args()

    if not args.epub_path.exists():
        print(f"File not found: {args.epub_path}", file=sys.stderr)
        return 1

    load_dotenv()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set (check .env)", file=sys.stderr)
        return 1

    client = Anthropic(api_key=api_key)

    print(f"Parsing {args.epub_path.name}...")
    metadata, chapters = parse_epub(args.epub_path)
    print(f"  Title:    {metadata['title']}")
    print(f"  Author:   {metadata['author']}")
    print(f"  Chapters: {len(chapters)}")

    if args.book_type:
        book_type = args.book_type
        detection = {"book_type": book_type, "confidence": "override", "reasoning": "user-specified --type"}
        print(f"  Type:     {book_type} (user override)")
    else:
        sample_text = "\n\n".join(ch.text for ch in chapters[:3])
        detection = detect_book_type(client, full_text=sample_text)
        book_type = detection["book_type"]
        print(f"  Type:     {book_type} (detected, confidence={detection['confidence']})")
        print(f"            reasoning: {detection['reasoning']}")
    print()

    results = {
        "title": metadata["title"],
        "author": metadata["author"],
        "source_file": args.epub_path.name,
        "book_type": book_type,
        "detection": detection,
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
                book_type=book_type,
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
