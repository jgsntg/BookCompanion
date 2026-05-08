# CLAUDE.md

Standing context for Claude Code working on this project.

## What this is

Audiobook Brain v1.1: personal "second brain" for books I've heard or read.

Every book in the library is a `books` row. Books reach the library two
ways:
- **Manual entry** — typed in (or picked from Open Library lookup) without
  an EPUB. Searchable via the user's note, but no chapter-level queries.
- **Ingestion** — the v0 extraction pipeline produced JSON, and the
  ingest script wrote it here. Full chapter-level queries available.

Both paths are first-class. The schema treats library state
(`reading_status`, `rating`, `note`, `cover_url`) and ingestion state
(`is_ingested`, `chapters`, `chunks`) as orthogonal.

## Layout

```
audiobook-brain-v1/
├── data/library.db                   # local SQLite, gitignored
├── scripts/                          # Python: ingestion only
│   ├── schema.sql
│   ├── dedupe.py                     # title+author normalization
│   ├── ingest.py
│   └── requirements.txt
└── web/                              # Next.js 15 app
    ├── app/
    │   ├── page.tsx                  # library, grouped by status
    │   ├── book/[id]/page.tsx        # detail + library panel + (if ingested) query box
    │   ├── library/add/page.tsx      # manual entry + Open Library lookup
    │   └── api/
    │       ├── books/[id]/route.ts   # legacy: chapter data for one book
    │       ├── library/route.ts      # GET list, POST create
    │       ├── library/[id]/route.ts # PATCH (status/rating/note), DELETE
    │       ├── lookup/route.ts       # Open Library proxy
    │       └── query/route.ts        # retrieval + synthesis (single book)
    ├── components/
    │   ├── QueryBox.tsx
    │   ├── LibraryPanel.tsx          # status / rating / note editor
    │   └── AddBookForm.tsx           # lookup + manual fallback
    └── lib/
        ├── db.ts                     # better-sqlite3 + sqlite-vec
        ├── dedupe.ts                 # MUST stay in sync with scripts/dedupe.py
        ├── embeddings.ts             # embedQuery + embedDocument
        └── synthesize.ts             # Claude synthesis prompt
```

## Important invariants

1. **`web/lib/dedupe.ts` and `scripts/dedupe.py` must stay in sync.**
   They compute the same `dedupe_key`, which is the UNIQUE constraint
   on `books`. If they drift, manual entries and ingested books will
   stop deduplicating correctly.

2. **`embedQuery` vs `embedDocument` is not interchangeable.**
   Voyage's `input_type` distinction matters for retrieval quality.
   Notes (typed by the user) and chapter chunks both use `embedDocument`.
   Only the search query at retrieval time uses `embedQuery`.

3. **`vec0` virtual tables don't observe FK cascades.**
   When deleting books, chapters, or chunks, you must delete from
   `chunk_vectors` explicitly first. The existing routes do this; preserve
   the pattern in any new code.

4. **Notes are first-class chunks.** When a user adds or edits a note,
   we delete prior `chunk_type='note'` rows for that book and embed the
   new note. This is what makes manual entries useful for retrieval —
   don't "optimize" by skipping the embed step.

5. **Reading status transitions auto-manage `finished_at`.**
   Setting status to `finished` from anything else sets `finished_at = now()`.
   Setting status away from `finished` clears it. Don't replicate this
   logic in the UI — let the API handle it.

## Project values (in priority order)

1. **The two prompts are still the product.** v0's extraction prompt
   and `web/lib/synthesize.ts`. UI changes are cheap; prompt quality
   determines whether queries feel useful.

2. **Single-book queries first.** v1 still scopes retrieval to one book.
   Cross-library synthesis is v2 and will use the same chunk store —
   notes will participate naturally because they're already in there.

3. **Library state is for the user, ingestion state is for the system.**
   Don't conflate them. A book can be `finished` and not ingested. A book
   can be ingested and `want_to_read` (you got the EPUB but haven't
   started). Both are valid.

## What not to do

- Don't add a "convert manual entry to ingested" UI flow. The user said
  no. The ingest script handles re-ingest cleanly via the dedupe key —
  if they want to upgrade, they run the ingest script and library state
  is preserved.
- Don't bundle better-sqlite3 (it's in `serverExternalPackages`).
- Don't switch embedding models without re-embedding everything.
- Don't add cross-book queries to the existing `/api/query` route.
  Build a separate route when v2 happens.
- Don't pre-fetch covers or proxy them through Next.js. Open Library's
  CDN is fine and cover_url is just a string.

## Models / cost

- Extraction (v0): `claude-sonnet-4-5`
- Synthesis (web): `claude-sonnet-4-5`
- Embeddings: `voyage-3-lite`, 512 dims
- Manual note embed: ~$0.00001 per note. Negligible.
