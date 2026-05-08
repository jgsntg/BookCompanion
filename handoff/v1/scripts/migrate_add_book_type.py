"""
Migrate an existing library.db to add book_type and expand chunk_type CHECK.

Run once after pulling the v1.2 changes. Idempotent.

Usage:
    python scripts/migrate_add_book_type.py
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import sqlite_vec

DB_PATH = Path(__file__).parent.parent / "data" / "library.db"

NEW_CHUNK_TYPES = (
    "'summary', 'claim', 'framework', 'passage', 'connection', 'question', 'note', "
    "'character', 'event', 'location'"
)


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def main() -> int:
    if not DB_PATH.exists():
        print(f"No database at {DB_PATH} — nothing to migrate.")
        return 0

    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA foreign_keys = OFF")

    cur = conn.cursor()

    # 1. Add book_type to books if missing.
    if not column_exists(conn, "books", "book_type"):
        print("Adding books.book_type ...")
        cur.execute("""
            ALTER TABLE books ADD COLUMN book_type TEXT
            CHECK (book_type IS NULL OR book_type IN ('fiction', 'nonfiction'))
        """)
    else:
        print("books.book_type already present, skipping.")

    # 2. Recreate chunks table to expand the CHECK constraint.
    cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='chunks'")
    existing_ddl = cur.fetchone()
    needs_rebuild = (
        existing_ddl
        and existing_ddl[0]
        and ("'character'" not in existing_ddl[0] or "'event'" not in existing_ddl[0])
    )

    if needs_rebuild:
        print("Rebuilding chunks table with expanded chunk_type CHECK ...")
        cur.executescript(f"""
            CREATE TABLE chunks_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
              chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
              chapter_number INTEGER,
              chunk_type TEXT NOT NULL CHECK (chunk_type IN ({NEW_CHUNK_TYPES})),
              content TEXT NOT NULL,
              payload TEXT NOT NULL
            );

            INSERT INTO chunks_new SELECT * FROM chunks;
            DROP TABLE chunks;
            ALTER TABLE chunks_new RENAME TO chunks;

            CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(book_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_chapter ON chunks(chapter_id);
        """)
    else:
        print("chunks.chunk_type CHECK already up to date, skipping rebuild.")

    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")
    conn.close()
    print("Migration complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
