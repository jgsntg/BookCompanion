"""
bulk_add_books.py — Add multiple manual library entries from a JSON list.

Usage:
    python bulk_add_books.py books.json
    python bulk_add_books.py books.json --no-cover   # skip Open Library lookups

Input JSON is a list of objects:
    [
      {"title": "...", "author": "...", "category": "...", "status": "finished", "finished_at": "2025-06-24"},
      ...
    ]

"status" is optional and defaults to "want_to_read". Valid values:
    want_to_read | reading | finished | abandoned

"finished_at" is optional (format "YYYY-MM-DD"). Only used when status is
"finished"; if omitted, defaults to the current time.

For each book this script:
  - Computes the dedupe_key (same algorithm as web/lib/dedupe.ts) and skips
    any book already in the library
  - Looks up Open Library for a cover image (best-effort; failures are ignored)
  - Inserts a row into book_companion.books

Library state (rating, note, blurb) is left empty — tweak in the UI afterwards.

Required env (read from scripts/.env or web/.env.local):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from dedupe import make_dedupe_key
from ingest_supabase import SupabaseRest

VALID_STATUSES = {"want_to_read", "reading", "finished", "abandoned"}


def load_env() -> SupabaseRest:
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / "web" / ".env.local")

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    missing = [
        name
        for name, value in [
            ("NEXT_PUBLIC_SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", service_role_key),
        ]
        if not value
    ]
    if missing:
        sys.exit(f"Missing env var(s): {', '.join(missing)}")

    return SupabaseRest(supabase_url, service_role_key)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_existing_book(client: SupabaseRest, dedupe_key: str) -> Optional[dict]:
    encoded = urllib.parse.quote(dedupe_key, safe="")
    rows = client.request("GET", f"/books?dedupe_key=eq.{encoded}&select=id,title")
    return rows[0] if rows else None


def lookup_cover(title: str, author: str) -> Optional[str]:
    """Best-effort Open Library cover lookup. Returns None on any failure."""
    q = urllib.parse.quote(f"{title} {author}")
    url = f"https://openlibrary.org/search.json?q={q}&limit=1&fields=cover_i"
    req = urllib.request.Request(url, headers={"User-Agent": "audiobook-brain (personal project)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None

    docs = data.get("docs") or []
    cover_i = docs[0].get("cover_i") if docs else None
    return f"https://covers.openlibrary.org/b/id/{cover_i}-M.jpg" if cover_i else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Bulk-add manual library entries from a JSON list.")
    parser.add_argument("json_path", type=Path, help="Path to a JSON file with a list of books")
    parser.add_argument("--no-cover", action="store_true", help="Skip Open Library cover lookups")
    args = parser.parse_args()

    if not args.json_path.exists():
        sys.exit(f"File not found: {args.json_path}")

    books = json.loads(args.json_path.read_text())
    if not isinstance(books, list):
        sys.exit("Input JSON must be a list of {title, author, category, status?} objects")

    client = load_env()

    added, skipped, failed = 0, 0, 0

    for entry in books:
        title = (entry.get("title") or "").strip()
        author = (entry.get("author") or "").strip()
        category = (entry.get("category") or "").strip() or None
        status = entry.get("status", "want_to_read")

        if not title or not author:
            print(f"  SKIP  (missing title/author): {entry}")
            failed += 1
            continue

        if status not in VALID_STATUSES:
            print(f"  SKIP  {title} — invalid status '{status}'")
            failed += 1
            continue

        finished_at_input = entry.get("finished_at")
        if finished_at_input:
            try:
                datetime.strptime(finished_at_input, "%Y-%m-%d")
            except ValueError:
                print(f"  SKIP  {title} — finished_at must be 'YYYY-MM-DD', got '{finished_at_input}'")
                failed += 1
                continue

        dedupe_key = make_dedupe_key(title, author)
        existing = get_existing_book(client, dedupe_key)
        if existing:
            print(f"  SKIP  {title} — already in library (id={existing['id']})")
            skipped += 1
            continue

        cover_url = None if args.no_cover else lookup_cover(title, author)

        if status == "finished":
            finished_at = f"{finished_at_input}T00:00:00Z" if finished_at_input else utc_now()
        else:
            finished_at = None

        body = {
            "title": title,
            "author": author,
            "dedupe_key": dedupe_key,
            "reading_status": status,
            "category": category,
            "cover_url": cover_url,
            "finished_at": finished_at,
        }

        client.request("POST", "/books", body, prefer="return=minimal")
        cover_note = "" if cover_url else " (no cover found)"
        print(f"  ADD   {title} — {author} [{category or 'uncategorized'}, {status}]{cover_note}")
        added += 1

    print()
    print(f"Added: {added}  Skipped (duplicate): {skipped}  Failed: {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
