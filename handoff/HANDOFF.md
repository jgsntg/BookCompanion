# Fiction/Non-fiction split — handoff (v2)

This bundle preserves the tuning you did to v0's combined prompt
(`key_events` with `characters_involved`, `first_appearance` flag,
sharper rules) and folds it into the split.

## What changed vs. the previous handoff

- **Field shapes match yours**: `key_events` (not `events`), with
  `characters_involved` sub-array. `characters` keeps `first_appearance`.
  `locations` stays simple — no `relationships` array.
- **Dropped `themes`**: it was speculative on my part and not in your
  tuned prompt. Schema chunk_type list no longer includes `'theme'`.
- **Rules 7-10 in the fiction extension are lifted from your prompt**
  almost verbatim. Don't re-tune what you already tuned.
- **Rule 5 in `_base.md` calls out** that plot beats belong in
  `key_events` (fiction only) and NOT in `summary`. This catches a
  failure mode where Claude leaks plot recap into the summary.

## v0 changes (in `BookCompanion/v0/`)

**Replace these files:**
- `src/extract.py` → adds `--type` flag and auto-detection
- `src/extractor.py` → composes prompt from base + extension fragments

**Add these files (new):**
- `src/detect_book_type.py` → the auto-detector
- `prompts/_base.md` → shared role, rules, output format
- `prompts/_shared_fields.txt` → JSON fields for both types
  (summary, claims, frameworks, memorable_passages, connections,
  questions_raised)
- `prompts/_nonfiction_fields.txt` → empty (non-fiction uses only
  shared fields)
- `prompts/_nonfiction_rules.txt` → rules 7-9 (claims must be
  debatable, frameworks must be reusable)
- `prompts/_fiction_fields.txt` → key_events, characters, locations
- `prompts/_fiction_rules.txt` → rules 7-10 lifted from your tuning

**Archive (don't delete) the old combined prompt:**
- `prompts/extract_chapter.md` → rename to
  `prompts/_archive_extract_chapter.md` for reference. The new
  composed prompts cover the same ground.

## v1 changes (in `BookCompanion/v1/`)

**Replace these files:**
- `scripts/schema.sql` → adds book_type column; chunk_type CHECK
  expanded to include 'character', 'event', 'location' (no 'theme')
- `scripts/ingest.py` → reads book_type; tolerates both `key_events`
  and `events` field names; preserves `characters_involved` in event
  payload and includes it in the embedded text for better retrieval
- `web/lib/synthesize.ts` → book_type-aware system prompts; fiction
  prompt knows about characters/events/locations and how to use
  characters_involved
- `web/app/api/query/route.ts` → fetches book_type, passes to synthesize

**Add this file (new):**
- `scripts/migrate_add_book_type.py` → one-time migration

## Order of operations

```bash
# 1. Apply v0 changes
cd BookCompanion/v0
mv prompts/extract_chapter.md prompts/_archive_extract_chapter.md
# … drop in the new prompts/ and src/ files …

# 2. Test extraction on one book
source .venv/bin/activate
python src/extract.py path/to/some.epub                # auto-detect
# Look at output/some-book.json — confirm book_type at top level
# and confirm key_events / characters / locations appear for fiction

# 3. Apply v1 changes
cd ../v1

# 4. Run migration once
source scripts/.venv/bin/activate   # or wherever you set up the venv
python scripts/migrate_add_book_type.py

# 5. Re-ingest the book
python scripts/ingest.py ../v0/output/some-book.json

# 6. Verify book_type made it
sqlite3 data/library.db "SELECT title, book_type FROM books"

# 7. Restart the dev server
cd web && npm run dev
```

## Verification queries to run after re-ingest

For a fiction book, ask all three of these and look at the Sources
panel:

- **"What happened in chapter X?"** → should retrieve `event` chunks
  for that chapter primarily.
- **"Who is [character name]?"** → should retrieve `character` chunks
  with that name.
- **"Who decided to do [action]?"** → should retrieve `event` chunks
  whose `characters_involved` includes the right name.

If the answer is correct AND the right chunk types appear in Sources,
you're done. If the answer is right but the chunk types are wrong,
the embedding strategy needs tweaking (probably the format we use
for `event` text). If the chunks are wrong, the v0 extraction prompt
needs tweaking.

## Books ingested before the migration

They have `book_type = NULL` and synthesis falls back to the generic
prompt. They keep working — just less specialized. Re-ingest when
you're ready and they pick up book_type from the v0 JSON.

## Future-proofing notes

- The composition pattern in `extractor.py` makes it easy to add a
  third type later (memoir? technical? children's?). New file
  `prompts/_<type>_fields.txt` + `prompts/_<type>_rules.txt`,
  add it to the validation set in `extractor.py`, done. Same for
  the detector — add a new option to the choices list.
- The schema's `book_type` CHECK constraint would need expansion to
  add a new type. One-line ALTER (or migration following the same
  pattern as `migrate_add_book_type.py`).
