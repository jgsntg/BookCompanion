# Audiobook Brain v1.1

Local-first second brain for the books you've heard or read. Two paths in:

1. **Manual entry** — type a title (or pick from Open Library), set status,
   rating, and a note. Searchable via the note.
2. **Ingestion** — feed a v0 extraction JSON through `scripts/ingest.py`.
   Full chapter-level queries.

Both produce a row in `books`. Library state (status, rating, note) and
ingestion state (chapters, chunks) live side by side and don't interfere.

## Setup

```bash
# Python side (ingest only)
cd scripts
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
echo "VOYAGE_API_KEY=pa-..." > .env
cd ..

# Node side (web app)
cd web
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY + VOYAGE_API_KEY
npm run dev
# → http://localhost:3000
```

## Daily flows

**Logging a book you read offline:**
1. Go to `/library/add`
2. Type the title in the search box → click an Open Library result to
   autofill (or skip and type manually)
3. Set status, rating, write your one-paragraph note → Add to library

**Reading a book in the app:**
1. Run v0 extraction:
   `python ../v0/src/extract.py somebook.epub`
2. Ingest:
   `python scripts/ingest.py ../audiobook-brain/output/some-book.json`
3. Open the book in the UI. Status is auto-set to "Reading."
4. Ask questions. Mark as Finished when done.

## What's queryable

- Ingested books: full chunk-level retrieval over claims, frameworks,
  passages, connections, and questions raised.
- Manual entries: just the note (embedded as a chunk).
- v1 retrieval is scoped to a single book at a time. v2 will add
  cross-library synthesis — notes will participate then.

## Schema highlights

- `books` is the master list. Every book has a `dedupe_key` derived from
  normalized title+author; duplicates are rejected at insert.
- `is_ingested` flags whether chapter-level data exists for the book.
- `reading_status` (`want_to_read` / `reading` / `finished` / `abandoned`)
  drives library grouping.
- `finished_at` is managed by the PATCH route, not the UI.

## Porting to Postgres later

The schema avoids SQLite-specific features. The dedupe key is computed in
application code (TS + Python), so it ports unchanged. The vector index
(`chunk_vectors`) is the only piece that needs a swap — `vec0` virtual
table → pgvector column. Roughly an afternoon of work.
