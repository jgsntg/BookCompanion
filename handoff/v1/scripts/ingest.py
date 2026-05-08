"""
ingest.py — Read v0 extraction JSON, write to SQLite, embed each chunk.

Usage:
    python scripts/ingest.py path/to/v0/output/some-book.json

Reads book_type from the v0 JSON top level. Emits chunks based on the
extraction shape, tolerating both old and new field names:
- shared (both types):  summary, claim, framework, passage,
                        connection, question
- fiction-only:         event, character, location

Note on field name mapping: the v0 prompt uses "key_events" (with
"characters_involved" sub-array) — we map that to chunk_type='event'
and preserve characters_involved in the payload so retrieval can use it.
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
    """
    Flatten one chapter's extraction into (chunk_type, embed_text, payload) tuples.

    Tolerant of multiple shapes:
    - "key_events" (current v0 prompt) and "events" (earlier name) both map to chunk_type='event'
    - characters_involved is preserved in the event payload for retrieval
    """
    out: list[tuple[str, str, dict]] = []

    # Shared
    if summary := extraction.get("summary"):
        out.append(("summary", summary, {"summary": summary}))

    for passage in extraction.get("memorable_passages") or []:
        if quote := passage.get("quote"):
            out.append(("passage", quote, passage))

    for connection in extraction.get("connections") or []:
        if connection:
            out.append(("connection", connection, {"connection": connection}))

    for question in extraction.get("questions_raised") or []:
        if question:
            out.append(("question", question, {"question": question}))

    for claim in extraction.get("claims") or []:
        if text := claim.get("claim", ""):
            out.append(("claim", text, claim))

    for fw in extraction.get("frameworks") or []:
        name = fw.get("name", "")
        desc = fw.get("description", "")
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("framework", text, fw))

    # Fiction-only
    for char in extraction.get("characters") or []:
        name = char.get("name", "")
        desc = char.get("description", "")
        # Embed "Name: description" so retrieval works for both
        # name lookups and trait lookups.
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("character", text, char))

    # Accept both "key_events" (current prompt) and "events" (legacy / shorter form)
    events_field = extraction.get("key_events") or extraction.get("events") or []
    for ev in events_field:
        # Current shape: {"event": "...", "characters_involved": [...]}
        # Legacy shape:  {"event": "...", "significance": "..."}
        text = ev.get("event", "")
        if not text:
            continue
        # If characters are involved, append them to the embedded text so a query like
        # "what did Marcus do" surfaces the event even if the chunk type is 'event' not 'character'.
        chars = ev.get("characters_involved") or []
        embed_text = f"{text} (involves: {', '.join(chars)})" if chars else text
        out.append(("event", embed_text, ev))

    for loc in extraction.get("locations") or []:
        name = loc.get("name", "")
        desc = loc.get("description", "")
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("location", text, loc))

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
    book_type = data.get("book_type")
    if book_type and book_type not in ("fiction", "nonfiction"):
        sys.exit(f"Invalid book_type in JSON: {book_type!r}")

    dedupe_key = make_dedupe_key(title, author)

    load_dotenv()
    api_key = os.environ.get("VOYAGE_API_KEY")
    if not api_key:
        sys.exit("VOYAGE_API_KEY not set (check .env)")
    voyage = voyageai.Client(api_key=api_key)

    conn = open_db()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO books (
            title, author, dedupe_key, source_file, chapter_count,
            is_ingested, ingest_status, reading_status, book_type
        )
        VALUES (?, ?, ?, ?, ?, 1, 'processing', 'reading', ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
            source_file = excluded.source_file,
            chapter_count = excluded.chapter_count,
            is_ingested = 1,
            ingest_status = 'processing',
            book_type = COALESCE(excluded.book_type, books.book_type),
            reading_status = CASE
                WHEN books.reading_status = 'want_to_read' THEN 'reading'
                ELSE books.reading_status
            END,
            updated_at = datetime('now')
        RETURNING id
    """, (title, author, dedupe_key, source, len(chapters), book_type))
    book_id = cur.fetchone()[0]

    cur.execute("""
        DELETE FROM chunk_vectors WHERE chunk_id IN (
            SELECT id FROM chunks WHERE book_id = ? AND chunk_type != 'note'
        )
    """, (book_id,))
    cur.execute("DELETE FROM chunks WHERE book_id = ? AND chunk_type != 'note'", (book_id,))
    cur.execute("DELETE FROM chapters WHERE book_id = ?", (book_id,))

    print(f"Ingesting {title} by {author} ({len(chapters)} chapters, type={book_type or 'unspecified'})")

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
