create or replace function book_companion.text_search_chunks(
  target_book_id integer,
  search_query text,
  match_count integer default 5
)
returns table (
  chunk_type text,
  content text,
  payload jsonb,
  chapter_number integer,
  chapter_title text,
  book_title text,
  book_author text,
  distance double precision
)
language sql
stable
security invoker
set search_path = book_companion, public, extensions
as $$
  select
    c.chunk_type,
    c.content,
    c.payload,
    c.chapter_number,
    ch.title as chapter_title,
    b.title as book_title,
    b.author as book_author,
    0.25 as distance
  from chunks c
  left join chapters ch on ch.id = c.chapter_id
  join books b on b.id = c.book_id
  where c.book_id = target_book_id
    and to_tsvector('english', c.content) @@ plainto_tsquery('english', search_query)
  order by ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', search_query)) desc
  limit match_count;
$$;

grant execute on function book_companion.text_search_chunks(integer, text, integer) to service_role;
