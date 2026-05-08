-- Audiobook Brain v1.2 schema
-- SQLite + sqlite-vec for vector search.

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,

  source_file TEXT,
  chapter_count INTEGER DEFAULT 0,

  reading_status TEXT NOT NULL DEFAULT 'want_to_read'
    CHECK (reading_status IN ('want_to_read', 'reading', 'finished', 'abandoned')),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  note TEXT,
  cover_url TEXT,
  finished_at TEXT,

  is_ingested INTEGER NOT NULL DEFAULT 0,
  current_chapter INTEGER DEFAULT 0,
  ingest_status TEXT DEFAULT 'none'
    CHECK (ingest_status IN ('none', 'processing', 'ready', 'failed')),
  book_type TEXT CHECK (book_type IS NULL OR book_type IN ('fiction', 'nonfiction')),

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_books_status ON books(reading_status);
CREATE INDEX IF NOT EXISTS idx_books_finished_at ON books(finished_at);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT,
  word_count INTEGER,
  extraction TEXT NOT NULL,
  UNIQUE(book_id, chapter_number)
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  chapter_number INTEGER,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN (
    'summary', 'claim', 'framework', 'passage', 'connection', 'question', 'note',
    'character', 'event', 'location'
  )),
  content TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(book_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chapter ON chunks(chapter_id);
