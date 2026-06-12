-- Adds category + blurb fields to support the My Library / How I Read views.
-- Run in the Supabase SQL editor for the shared MyPlayground project.

alter table book_companion.books
  add column if not exists category text,
  add column if not exists blurb text;
