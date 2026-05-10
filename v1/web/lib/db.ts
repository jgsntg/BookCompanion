import { createClient } from "@supabase/supabase-js";

const SUPABASE_SCHEMA = "book_companion";

type Json = Record<string, unknown> | unknown[];

export type ReadingStatus = "want_to_read" | "reading" | "finished" | "abandoned";
export type BookType = "fiction" | "nonfiction";

export interface BookRow {
  id: number;
  title: string;
  author: string;
  dedupe_key: string;
  source_file: string | null;
  chapter_count: number;
  reading_status: ReadingStatus;
  rating: number | null;
  note: string | null;
  cover_url: string | null;
  finished_at: string | null;
  is_ingested: boolean;
  current_chapter: number;
  ingest_status: "none" | "processing" | "ready" | "failed";
  book_type: BookType | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterRow {
  id: number;
  book_id: number;
  chapter_number: number;
  title: string | null;
  word_count: number | null;
  extraction: Json;
}

export interface ChunkRow {
  id: number;
  book_id: number;
  chapter_id: number | null;
  chapter_number: number | null;
  chunk_type: string;
  content: string;
  payload: Json;
}

export interface LibraryBookRow {
  id: number;
  title: string;
  author: string;
  reading_status: ReadingStatus;
  rating: number | null;
  cover_url: string | null;
  is_ingested: boolean;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  chunk_count: number;
}

export interface MatchedChunkRow {
  chunk_type: string;
  content: string;
  payload: Json;
  chapter_number: number | null;
  chapter_title: string | null;
  book_title: string;
  book_author: string;
  distance: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabase() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    db: { schema: SUPABASE_SCHEMA },
    auth: { persistSession: false },
  });
}

export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function listLibraryBooks(status?: ReadingStatus): Promise<LibraryBookRow[]> {
  const supabase = getSupabase();

  let query = supabase
    .from("books")
    .select(`
      id,
      title,
      author,
      reading_status,
      rating,
      cover_url,
      is_ingested,
      finished_at,
      created_at,
      updated_at,
      chunks(count)
    `);

  if (status) {
    query = query.eq("reading_status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      reading_status: book.reading_status,
      rating: book.rating,
      cover_url: book.cover_url,
      is_ingested: book.is_ingested,
      finished_at: book.finished_at,
      created_at: book.created_at,
      updated_at: book.updated_at,
      chunk_count: book.chunks?.[0]?.count ?? 0,
    }))
    .sort(compareLibraryBooks);
}

export async function getBook(id: number): Promise<BookRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBookChapters(bookId: number): Promise<ChapterRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("chapter_number", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getBookByDedupeKey(dedupeKey: string): Promise<Pick<BookRow, "id"> | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("books")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createBook(input: {
  title: string;
  author: string;
  dedupe_key: string;
  reading_status: ReadingStatus;
  rating: number | null;
  note: string | null;
  cover_url: string | null;
  finished_at: string | null;
}): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("books")
    .insert(input)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateBook(id: number, updates: Partial<BookRow>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("books").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteBook(id: number): Promise<boolean> {
  const supabase = getSupabase();
  const { error, count } = await supabase.from("books").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function replaceNoteChunk(bookId: number, note: string | null, embedding?: number[]): Promise<void> {
  const supabase = getSupabase();

  const { error: deleteError } = await supabase
    .from("chunks")
    .delete()
    .eq("book_id", bookId)
    .eq("chunk_type", "note");
  if (deleteError) throw deleteError;

  if (!note || !embedding) return;

  const { data: chunk, error: chunkError } = await supabase
    .from("chunks")
    .insert({
      book_id: bookId,
      chapter_id: null,
      chapter_number: null,
      chunk_type: "note",
      content: note,
      payload: { note },
    })
    .select("id")
    .single();
  if (chunkError) throw chunkError;

  const { error: vectorError } = await supabase
    .from("chunk_vectors")
    .insert({ chunk_id: chunk.id, embedding: toVector(embedding) });
  if (vectorError) throw vectorError;
}

export async function matchChunks(
  bookId: number,
  queryEmbedding: number[],
  matchCount: number
): Promise<MatchedChunkRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: toVector(queryEmbedding),
    target_book_id: bookId,
    match_count: matchCount,
  });

  if (error) throw error;
  return data ?? [];
}

export async function textSearchChunks(
  bookId: number,
  searchQuery: string,
  matchCount: number
): Promise<MatchedChunkRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("text_search_chunks", {
    target_book_id: bookId,
    search_query: searchQuery,
    match_count: matchCount,
  });

  if (error) throw error;
  return (data ?? []).map((r: MatchedChunkRow) => ({
    ...r,
    chapter_number: r.chapter_number ?? 0,
  }));
}

function compareLibraryBooks(a: LibraryBookRow, b: LibraryBookRow): number {
  const statusOrder: Record<ReadingStatus, number> = {
    reading: 0,
    want_to_read: 1,
    finished: 2,
    abandoned: 3,
  };

  const statusDiff = statusOrder[a.reading_status] - statusOrder[b.reading_status];
  if (statusDiff !== 0) return statusDiff;

  const aDate = Date.parse(a.finished_at ?? a.updated_at ?? a.created_at);
  const bDate = Date.parse(b.finished_at ?? b.updated_at ?? b.created_at);
  return bDate - aDate;
}
