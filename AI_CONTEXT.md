# AI Agent Context

This file is the source of truth for AI agents working in this repo.
`CLAUDE.md` and `AGENTS.md` are symlinks to this file.

## Project overview

BookCompanion (a.k.a. Audiobook Brain) is a personal "second brain" for books
you've listened to or read. v0 is a standalone Python extraction pipeline that
turns an EPUB into structured JSON (claims, frameworks, passages, connections,
open questions). v1 is a Next.js 15 web app backed by Supabase that lets you
log books manually, ingest v0 extraction output, and query individual books via
semantic retrieval + LLM synthesis.

## Repo layout

```
BookCompanion/
├── v0/     # standalone EPUB → JSON extraction (see v0/CLAUDE.md)
└── v1/     # web app + Supabase ingest scripts (see v1/CLAUDE.md)
```

## Shared principle

The two prompts are the product: `v0/prompts/extract_chapter.md` (extraction)
and `v1/web/lib/synthesize.ts` (synthesis). Prefer surgical prompt edits over
code refactors. Everything else is plumbing.

## Handoff workflow

When ending a session, write a handoff to `.ai/handoffs/YYYY-MM-DD-<slug>.md`
following `.ai/handoffs/TEMPLATE.md`, then update `.ai/handoffs/CURRENT.md`
to point to it. When starting a session, read `.ai/handoffs/CURRENT.md` first.
