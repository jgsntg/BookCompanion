"""
ingest.py — Read v0 extraction JSON, write to SQLite, embed each chunk.

Usage:
    python scripts/ingest.py path/to/v0/output/some-book.json

Behavior:
- Computes dedupe_key = normalize(title) + "::" + normalize(author).
- If a book row with that key already exists (e.g. user manually logged
  it earlier), this script *upgrades* it in place: keeps reading_status,
  rating, note, etc., and adds chapters/chunks/ingestion fields.
  (The user said they don't need this, but the schema gets it for free
  and avoiding it would mean blocking re-ingest after manual entry,
  which is a worse UX.)
- If extracted chapters yield no chunks (rare), the row still upgrades
  cleanly — the book becomes "ingested" with zero chunks.
"""

from __future__ import annotations

import json
import os
import sqlite3
import struct
import sys
from pathlib import Path

import sqlite_vec
import voyageai
from dotenv import load_dotenv

from dedupe import make_dedupe_key

DB_PATH = Path(__file__).parent.parent / "data" / "library.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"
EMBED_MODEL = "voyage-3-lite"
EMBED_DIMS = 512


def serialize_vector(values: list[float]) -> bytes:
    return struct.pack(f"{len(values)}f", *values)


def open_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript(SCHEMA_PATH.read_text())
    conn.execute(f"""
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding FLOAT[{EMBED_DIMS}]
        )
    """)
    conn.commit()
    return conn


def chunks_from_extraction(extraction: dict) -> list[tuple[str, str, dict]]:
    out: list[tuple[str, str, dict]] = []

    if summary := extraction.get("summary"):
        out.append(("summary", summary, {"summary": summary}))

    for claim in extraction.get("claims") or []:
        text = claim.get("claim", "")
        if text:
            out.append(("claim", text, claim))

    for fw in extraction.get("frameworks") or []:
        name = fw.get("name", "")
        desc = fw.get("description", "")
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("framework", text, fw))

    for passage in extraction.get("memorable_passages") or []:
        quote = passage.get("quote", "")
        if quote:
            out.append(("passage", quote, passage))

    for connection in extraction.get("connections") or []:
        if connection:
            out.append(("connection", connection, {"connection": connection}))

    for question in extraction.get("questions_raised") or []:
        if question:
            out.append(("question", question, {"question": question}))

    return out


def embed_batch(client: voyageai.Client, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    result = client.embed(texts, model=EMBED_MODEL, input_type="document")
    return result.embeddings


def ingest(json_path: Path) -> None:
    data = json.loads(json_path.read_text())
    title = data["title"]
    author = data["author"]
    source = data["source_file"]
    chapters = data["chapters"]
    dedupe_key = make_dedupe_key(title, author)

    load_dotenv()
    api_key = os.environ.get("VOYAGE_API_KEY")
    if not api_key:
        sys.exit("VOYAGE_API_KEY not set (check .env)")
    voyage = voyageai.Client(api_key=api_key)

    conn = open_db()
    cur = conn.cursor()

    # Upsert book on dedupe_key. Preserve user-edited library fields if row exists.
    cur.execute("""
        INSERT INTO books (
            title, author, dedupe_key, source_file, chapter_count,
            is_ingested, ingest_status, reading_status
        )
        VALUES (?, ?, ?, ?, ?, 1, 'processing', 'reading')
        ON CONFLICT(dedupe_key) DO UPDATE SET
            source_file = excluded.source_file,
            chapter_count = excluded.chapter_count,
            is_ingested = 1,
            ingest_status = 'processing',
            -- bump to 'reading' only if it was 'want_to_read'; preserve other states
            reading_status = CASE
                WHEN books.reading_status = 'want_to_read' THEN 'reading'
                ELSE books.reading_status
            END,
            updated_at = datetime('now')
        RETURNING id
    """, (title, author, dedupe_key, source, len(chapters)))
    book_id = cur.fetchone()[0]

    # Wipe prior ingestion artifacts (re-ingest is allowed and idempotent).
    # Note: chunks of type 'note' are user-authored, not from extraction —
    # preserve them.
    cur.execute("""
        DELETE FROM chunk_vectors WHERE chunk_id IN (
            SELECT id FROM chunks WHERE book_id = ? AND chunk_type != 'note'
        )
    """, (book_id,))
    cur.execute("DELETE FROM chunks WHERE book_id = ? AND chunk_type != 'note'", (book_id,))
    cur.execute("DELETE FROM chapters WHERE book_id = ?", (book_id,))

    print(f"Ingesting {title} by {author} ({len(chapters)} chapters)")

    total_chunks = 0
    for ch in chapters:
        if not ch.get("extraction"):
            print(f"  [{ch['chapter_number']:>2}] (skipped — no extraction)")
            continue

        cur.execute("""
            INSERT INTO chapters (book_id, chapter_number, title, word_count, extraction)
            VALUES (?, ?, ?, ?, ?)
        """, (
            book_id,
            ch["chapter_number"],
            ch.get("title"),
            ch.get("word_count"),
            json.dumps(ch["extraction"]),
        ))
        chapter_id = cur.lastrowid

        chunk_tuples = chunks_from_extraction(ch["extraction"])
        if not chunk_tuples:
            print(f"  [{ch['chapter_number']:>2}] {ch.get('title','')} — 0 chunks")
            continue

        texts = [t[1] for t in chunk_tuples]
        embeddings = embed_batch(voyage, texts)

        for (chunk_type, content, payload), embedding in zip(chunk_tuples, embeddings):
            cur.execute("""
                INSERT INTO chunks (book_id, chapter_id, chapter_number, chunk_type, content, payload)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (book_id, chapter_id, ch["chapter_number"], chunk_type, content, json.dumps(payload)))
            chunk_id = cur.lastrowid

            cur.execute(
                "INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)",
                (chunk_id, serialize_vector(embedding)),
            )

        total_chunks += len(chunk_tuples)
        print(f"  [{ch['chapter_number']:>2}] {ch.get('title','')} — {len(chunk_tuples)} chunks")

    cur.execute(
        "UPDATE books SET ingest_status = 'ready', updated_at = datetime('now') WHERE id = ?",
        (book_id,),
    )
    conn.commit()
    conn.close()
    print(f"\nDone. {total_chunks} chunks embedded. DB: {DB_PATH}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python scripts/ingest.py path/to/extraction.json")
    ingest(Path(sys.argv[1]))
