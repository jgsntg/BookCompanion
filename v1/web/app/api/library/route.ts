import { NextRequest, NextResponse } from "next/server";
import { getDb, serializeVector } from "@/lib/db";
import { makeDedupeKey } from "@/lib/dedupe";
import { embedDocument } from "@/lib/embeddings";

// GET /api/library?status=finished
// Returns library books, optionally filtered by reading_status.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const db = getDb();

  const validStatuses = new Set(["want_to_read", "reading", "finished", "abandoned"]);
  const where = status && validStatuses.has(status) ? "WHERE reading_status = ?" : "";
  const params = status && validStatuses.has(status) ? [status] : [];

  const rows = db
    .prepare(`
      SELECT
        id, title, author, reading_status, rating, cover_url,
        is_ingested, finished_at, created_at,
        (SELECT COUNT(*) FROM chunks WHERE book_id = books.id) AS chunk_count
      FROM books
      ${where}
      ORDER BY
        CASE reading_status
          WHEN 'reading' THEN 0
          WHEN 'want_to_read' THEN 1
          WHEN 'finished' THEN 2
          WHEN 'abandoned' THEN 3
        END,
        COALESCE(finished_at, updated_at) DESC
    `)
    .all(...params);

  return NextResponse.json({ books: rows });
}

// POST /api/library
// Manually log a book. Body: { title, author, reading_status?, rating?, note?, cover_url? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, author, reading_status, rating, note, cover_url } = body;

    if (!title || !author) {
      return NextResponse.json({ error: "title and author are required" }, { status: 400 });
    }

    const validStatuses = new Set(["want_to_read", "reading", "finished", "abandoned"]);
    const status = validStatuses.has(reading_status) ? reading_status : "finished";

    if (rating != null && (typeof rating !== "number" || rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });
    }

    const dedupeKey = makeDedupeKey(title, author);
    const finishedAt = status === "finished" ? new Date().toISOString() : null;

    const db = getDb();

    const existing = db.prepare("SELECT id FROM books WHERE dedupe_key = ?").get(dedupeKey) as
      | { id: number }
      | undefined;

    if (existing) {
      return NextResponse.json(
        { error: "A book with this title and author already exists.", id: existing.id },
        { status: 409 }
      );
    }

    const insert = db.prepare(`
      INSERT INTO books (
        title, author, dedupe_key, reading_status, rating, note, cover_url, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      title.trim(),
      author.trim(),
      dedupeKey,
      status,
      rating ?? null,
      note?.trim() || null,
      cover_url ?? null,
      finishedAt
    );
    const bookId = Number(result.lastInsertRowid);

    // If a note was provided, embed it as a chunk so it shows up in retrieval.
    const trimmedNote = note?.trim();
    if (trimmedNote) {
      const embedding = await embedDocument(trimmedNote);
      const chunkInsert = db.prepare(`
        INSERT INTO chunks (book_id, chapter_id, chapter_number, chunk_type, content, payload)
        VALUES (?, NULL, NULL, 'note', ?, ?)
      `);
      const chunkResult = chunkInsert.run(bookId, trimmedNote, JSON.stringify({ note: trimmedNote }));
      db.prepare("INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)")
        .run(Number(chunkResult.lastInsertRowid), serializeVector(embedding));
    }

    return NextResponse.json({ id: bookId }, { status: 201 });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
