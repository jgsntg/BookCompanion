# Handoff: AI Product Playbook dedupe repair

**From:** Codex
**To:** next session
**Date:** 2026-05-10
**Branch:** `main`
**Last commit:** `58ccd65 Added PDF support`

---

## Goal

Keep manual library rows and ingestion output attached to the same Supabase book when titles/authors differ slightly between lookup/manual entry and extracted metadata.

## Status

- [x] Supabase duplicate repaired: book id 5 was merged into manual book id 4.
- [x] Book id 4 now has 84 chapters, 1000 chunks, `is_ingested=true`, and `ingest_status=ready`.
- [x] Book id 5 was deleted after its ingestion artifacts were moved.
- [x] Dedupe normalization now avoids rewriting comma-separated coauthors as `Last, First`.
- [x] PDF parsing now extracts trailing parenthetical authors when metadata author is `Unknown`.

## Files touched this session

- `v0/src/pdf_parser.py` — repairs `Unknown` PDF author metadata from a trailing title parenthetical like `(Marily Nika, Diego Granados)`.
- `v1/scripts/dedupe.py` — preserves comma-separated coauthor order in Python dedupe keys.
- `v1/web/lib/dedupe.ts` — mirrors the Python dedupe behavior for manual web entries.
- `v0/output/the-ai-product-playbook-strategies-skills-and-frameworks-for-the-ai-driven-produ.json` — local generated output header corrected, but this output file is not tracked by git.

## Key decisions made

- Kept the manual row as canonical because it held the user-created library entry.
- Moved chapters and chunks from id 5 to id 4 rather than re-ingesting, preserving existing embeddings.
- Used a conservative parenthetical-author repair only when PDF metadata author is exactly `Unknown`.

## Gotchas

- `v0/output/...json` is ignored/untracked, so its correction will not appear in `git status`.
- A direct `python3 -m py_compile` tried to write bytecode under the macOS user cache and failed in the sandbox; rerunning with `PYTHONPYCACHEPREFIX=/private/tmp/bookcompanion-pycache` passed.

## Next steps

1. Commit the three tracked code changes if they look good.
2. Consider adding focused tests for `make_dedupe_key` and `_repair_title_author_from_parenthetical`.

## Open questions

- Should extraction output JSON files remain ignored, or should selected fixture-like outputs be tracked for regression checks?

## Context the next agent needs

The original mismatch was:

- Manual Supabase row id 4: title without parenthetical authors, author `Marily Nika, Diego Granados`, not ingested.
- Ingested Supabase row id 5: title included `(Marily Nika, Diego Granados)`, author `Unknown`, ready with chunks.

Verification performed:

- Supabase after merge: only id 4 remains among ids 4/5, with 84 chapters and 1000 chunks.
- `PYTHONPYCACHEPREFIX=/private/tmp/bookcompanion-pycache python3 -m py_compile v0/src/pdf_parser.py v1/scripts/dedupe.py`
- `npm run build` in `v1/web`
