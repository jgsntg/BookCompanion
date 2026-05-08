"""
One-time migration: add book_type column to books.

Safe to re-run — catches the duplicate-column error SQLite raises if
the column already exists.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "library.db"


def migrate() -> None:
    if not DB_PATH.exists():
        print(f"No database found at {DB_PATH} — nothing to migrate.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "ALTER TABLE books ADD COLUMN "
            "book_type TEXT CHECK (book_type IN ('fiction', 'nonfiction'))"
        )
        conn.commit()
        print("Migration complete: added book_type column to books.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("Already migrated (book_type column exists).")
        else:
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
