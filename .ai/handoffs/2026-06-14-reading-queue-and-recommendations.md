# Handoff: Reading queue + "You might also like" recommendations

**From:** Claude Code
**To:** Claude Code | next session
**Date:** 2026-06-14
**Branch:** `main`
**Last commit:** `16097e0 EOD handoff` (this session's changes are uncommitted)

---

## Goal

Add two v1.1 features the user requested: (1) a reading queue — order
"want to read" books and surface the top 5 as "Up Next" on the home page
below "Currently Reading" — and (2) per-finished-book "you might also like"
recommendations, LLM-generated on demand, with a one-click "+ Want to read"
to add a suggestion to the library.

## Status

- [x] Migration `004_queue_and_recommendations.sql` written and pushed to
      the linked Supabase project via `supabase db push` (already applied —
      `book_companion.books` has `queue_position`, `recommendations`,
      `recommendations_generated_at`).
- [x] `lib/db.ts`: new types (`RecommendationItem`), `BookRow`/`LibraryBookRow`
      extended, new helpers `getQueue`, `getUnqueuedWantToRead`, `addToQueue`,
      `removeFromQueue`, `reorderQueue`, `saveRecommendations`,
      `listLibraryTitles`.
- [x] `lib/recommend.ts` (new) — `generateRecommendations()`, mirrors
      `synthesize.ts`'s Anthropic/OpenAI provider switch.
- [x] New API routes: `POST/DELETE /api/library/[id]/queue`,
      `PUT /api/queue`, `POST /api/library/[id]/recommendations`.
- [x] New UI: `/queue` page + `QueueManager.tsx` (▲/▼ reorder, add/remove),
      "Up Next" section on home page, queue control in `LibraryPanel`,
      "Queue" nav link, `Recommendations.tsx` on finished books' pages.
- [x] CSS additions in `globals.css` for `.queue-row`, `.rec-card`, etc.
- [x] `npm run build` passes (no type errors).
- [x] End-to-end verified via curl against the dev server (queue add/reorder,
      "Up Next" rendering, `/queue` page, recommendation generation for
      "Starter Villain" returned 5 real suggestions, "+ Want to read" add flow
      with Open Library cover lookup).

Everything is implemented and working. **Nothing has been committed yet** —
the user wanted to review the diff first (working tree has the modified +
untracked files listed below).

## Files touched this session

- `v1/web/supabase/migrations/004_queue_and_recommendations.sql` — new;
  adds `queue_position` (int), `recommendations` (jsonb),
  `recommendations_generated_at` (timestamptz) + index on `queue_position`.
  **Already applied to remote Supabase.**
- `v1/web/lib/db.ts` — new types + queue/recommendation helper functions
  (see Status above). `listLibraryBooks` and the new `getQueue` both select
  `queue_position` now.
- `v1/web/lib/recommend.ts` — new. LLM call that returns up to 5
  `{title, author, reason}` suggestions, excluding books already in the
  library (via `listLibraryTitles`). Strips ```` ```json ```` fences before
  parsing; throws on bad JSON (surfaced as a UI error, user can retry).
- `v1/web/app/api/library/[id]/queue/route.ts` — new. POST adds to queue
  (400 if book isn't `want_to_read`), DELETE removes.
- `v1/web/app/api/queue/route.ts` — new. PUT `{ ids: number[] }` rewrites
  `queue_position` for the whole queue based on array order.
- `v1/web/app/api/library/[id]/recommendations/route.ts` — new. POST
  generates + persists recommendations for one book.
- `v1/web/app/queue/page.tsx` — new. Server component rendering
  `QueueManager` with `getQueue()` (queued) and `getUnqueuedWantToRead()`.
- `v1/web/components/QueueManager.tsx` — new. Client component: ▲/▼ reorder
  (optimistic local state + `PUT /api/queue`, syncs via `useEffect` on the
  `queued` prop after `router.refresh()`), remove, and "+ Add to queue" for
  unqueued want-to-read books.
- `v1/web/components/Recommendations.tsx` — new. Client component:
  "Get suggestions"/"Regenerate" button, per-suggestion "+ Want to read"
  (does an `/api/lookup` cover lookup, then `POST /api/library`; handles 409
  "already in library" by linking to the existing book).
- `v1/web/app/page.tsx` — added "Up Next" section (`getQueue(5)`) below
  "Currently Reading", with a "Manage queue →" link to `/queue`. Omitted
  entirely when the queue is empty.
- `v1/web/app/book/[id]/page.tsx` — passes `queue_position` into
  `LibraryPanel`'s `initial` prop; renders `<Recommendations>` when
  `reading_status === "finished"`.
- `v1/web/components/LibraryPanel.tsx` — added `queue_position` to the
  `initial` prop type; for `want_to_read` books, shows "#N in queue" +
  "Remove from queue" or "+ Add to reading queue" (acts immediately via the
  queue API, like the existing "Delete book" button — independent of the
  save/dirty flow).
- `v1/web/components/NavBar.tsx` — added `{ href: "/queue", label: "Queue" }`.
- `v1/web/app/globals.css` — added `.small-cover` (generalized from the
  lookup-results-only version), `.queue-list`/`.queue-row`/
  `.queue-row-actions`, `.button.ghost.icon`, `.rec-list`/`.rec-card`/
  `.rec-reason`.

## Key decisions made

- Recommendations are **on-demand** (button click), not auto-generated on
  marking a book finished — confirmed with user, keeps LLM cost opt-in and
  the 34-book backlog untouched unless visited.
- Queue reordering uses **▲/▼ buttons**, no drag-and-drop dependency —
  confirmed with user, matches the project's minimal-dependency style.
- `PUT /api/queue` takes the *full* ordered `ids` array and rewrites all
  `queue_position`s 1..N — simpler than per-item position math and avoids
  unique-constraint race conditions (no DB uniqueness constraint on
  `queue_position`, just an index).
- Recommendation JSON parsing has **no retry loop** (unlike v0's chapter
  extraction self-repair) — low-stakes, user can just click "Regenerate".
- Migration 004 was pushed via `supabase db push` (user opted for this over
  manual SQL-editor application, per migration 003's precedent) — already
  live on the shared Supabase project.

## Gotchas

- `QueueManager`'s local `items` state is seeded from the `queued` prop on
  mount; a `useEffect` re-syncs it whenever `queued` changes (i.e. after
  `router.refresh()`). If you add more client-side optimistic state here,
  remember this pattern or it'll go stale across refreshes.
- The "+ Want to read" cover lookup in `Recommendations.tsx` is best-effort —
  swallows fetch errors and falls back to `cover_url: null`.
- Verification left **real data**: book id 7 ("Starter Villain") now has 5
  saved recommendations (Hench, Soon I Will Be Invincible, etc.) generated
  during testing — this is legitimate output, left in place intentionally.
  All other test artifacts (a temporarily-added "Hench" book, temporary
  queue positions on books 18/71/73) were cleaned up via the API before
  ending the session — `want_to_read` queue is empty again, ready for the
  user to populate via `/queue`.

## Next steps

1. User to review the diff (`git status` shows 6 modified + 8 new paths, all
   listed above) and commit when satisfied.
2. User populates their actual reading queue via `/queue` (currently empty).
3. Optionally try "Get suggestions" on a few more finished books to see how
   the recommendation prompt performs across genres (only "Starter Villain"
   tested so far).

## Open questions

- None outstanding for this work.

## Context the next agent needs

- Plan file for this work (if still present):
  `/Users/josesantiago/.claude/plans/delegated-sleeping-kitten.md` — full
  design rationale for both features.
- Prior handoff `.ai/handoffs/2026-06-11-handoff-command-review.md` is an
  unrelated open thread (Ledger handoff-command comparison) — still pending,
  not touched this session.
- v0 Theft of Swords re-ingest (from the previous handoff) is still
  outstanding — unrelated to this session's work, not touched.
