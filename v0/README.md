# Audiobook Brain — Extraction v0

Standalone script that takes an EPUB and produces structured chapter-level
extractions (claims, frameworks, memorable passages, connections, open questions)
as JSON. No database, no UI — just the core processing loop, tunable prompt-first.

The point of v0 is to nail the extraction prompt against real books before
building anything else around it.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then add your ANTHROPIC_API_KEY
```

## Run

```bash
python src/extract.py path/to/book.epub
```

Outputs to `output/{book-slug}.json`.

## Iteration loop

1. Run on a book you've already finished (so you can judge quality).
2. Open the JSON. Read it like a stranger would.
3. Ask: "If I queried this in 6 months, would it actually surface what I want?"
4. Edit `prompts/extract_chapter.md` to fix what's wrong.
5. Re-run. Compare.

The extraction prompt is the product. Everything else is plumbing.

## Cost ballpark

Sonnet 4.6, ~25 chapters/book, ~3-4k tokens in / ~1k tokens out per chapter.
Roughly $0.30–$0.80 per book. Cache by chapter hash so re-runs after prompt
edits only re-process changed chapters (TODO).
