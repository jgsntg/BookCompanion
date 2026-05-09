o# CLAUDE.md

Standing context for Claude Code working on this project.

## What this is

Personal "second brain" for audiobooks. The user listens; we process the
matching EPUB. Output is a queryable knowledge base of extracted claims,
frameworks, memorable passages, and cross-book connections.

Currently at v0: standalone Python extraction script. No DB, no UI yet.

## Project values (in priority order)

1. **The extraction prompt is the product.** Code changes are cheap; prompt
   quality is what determines whether this tool feels magical or mediocre.
   When in doubt, spend the time on `prompts/extract_chapter.md`, not on
   refactoring.

2. **Selective beats exhaustive.** A chapter with 3 sharp claims is better
   than one with 15 mushy ones. Push back if extraction output is bloating.

3. **Quality over coverage.** Empty arrays are fine. Don't pad. Don't invent
   frameworks where none exist.

4. **Iterate on real books.** Test changes against actual EPUBs the user
   has finished, not synthetic examples. The user will tell you which book
   to use as the canary.

## Stack

- Python 3.11+
- `ebooklib` for EPUB parsing
- `beautifulsoup4` for HTML cleanup inside chapters
- **Multi-provider LLM** via `src/llm_client.py` — set `LLM_PROVIDER=anthropic|openai` in `.env` or pass `--provider` flag
  - Anthropic: `claude-sonnet-4-5` (extraction), `claude-haiku-4-5-20251001` (detection)
  - OpenAI: `gpt-4o` (extraction), `gpt-4o-mini` (detection)
  - Default is `anthropic`
- Plain JSON output to `output/`

## What not to do

- Don't add a database, web framework, or UI to this v0 script. That's a
  later phase. Keep the surface small.
- Don't switch the extraction model to Opus without discussing — cost
  multiplies fast across a library.
- Don't over-engineer chunking. Chapters as the unit is fine for v0.
- Don't add features the user didn't ask for (progress tracking, spoiler
  filtering, embeddings, retrieval). Those belong in v1+.

## Iteration workflow

When the user says "the extraction looks off," the loop is:

1. Look at the actual JSON output they're flagging.
2. Identify the failure mode (over-extraction, generic claims, plot summary
   leaking in, etc.).
3. Edit `prompts/extract_chapter.md` — usually one or two surgical changes,
   not a rewrite.
4. Re-run on the same chapter or book.
5. Diff the output. Confirm the fix; check for regressions elsewhere.

Resist the urge to rewrite the whole prompt. Small edits, fast cycles.

## File map

- `src/extract.py` — entrypoint, orchestrates parse → extract → write; `--provider` flag
- `src/epub_parser.py` — EPUB → list of (chapter_number, title, text)
- `src/llm_client.py` — provider abstraction (Anthropic / OpenAI), `LLMClient.from_env()`
- `src/extractor.py` — calls LLM with the prompt, returns structured JSON
- `src/detect_book_type.py` — quick LLM call to classify fiction vs nonfiction
- `prompts/extract_chapter.md` — the extraction prompt itself
- `output/` — JSON results, gitignored
- `.env` — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LLM_PROVIDER` (gitignored)
