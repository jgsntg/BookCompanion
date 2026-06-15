-- Adds reading-queue ordering and cached "similar books" recommendations.
-- Run in the Supabase SQL editor for the shared MyPlayground project.

alter table book_companion.books
  add column if not exists queue_position integer,
  add column if not exists recommendations jsonb,
  add column if not exists recommendations_generated_at timestamptz;

create index if not exists idx_books_queue_position
  on book_companion.books(queue_position);
