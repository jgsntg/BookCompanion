import { NextRequest, NextResponse } from "next/server";
import { getDb, serializeVector } from "@/lib/db";
import { embedDocument } from "@/lib/embeddings";

const VALID_STATUSES = new Set(["want_to_read", "reading", "finished", "abandoned"]);

// PATCH /api/library/:id
// Body: any subset of { reading_status, rating, note, current_chapter }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const existing = db
      .prepare("SELECT id, reading_status, finished_at FROM books WHERE id = ?")
      .get(id) as { id: number; reading_status: string; finished_at: string | null } | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.reading_status !== undefined) {
      if (!VALID_STATUSES.has(body.reading_status)) {
        return NextResponse.json({ error: "invalid reading_status" }, { status: 400 });
      }
      updates.push("reading_status = ?");
      values.push(body.reading_status);

      // Auto-set finished_at on transition into 'finished'.
      if (body.reading_status === "finished" && existing.reading_status !== "finished") {
        updates.push("finished_at = datetime('now')");
      }
      // Clear finished_at if moving back out of finished.
      if (body.reading_status !== "finished" && existing.reading_status === "finished") {
        updates.push("finished_at = NULL");
      }
    }

    if (body.rating !== undefined) {
      if (body.rating !== null && (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5)) {
        return NextResponse.json({ error: "rating must be 1-5 or null" }, { status: 400 });
      }
      updates.push("rating = ?");
      values.push(body.rating);
    }

    if (body.current_chapter !== undefined) {
      updates.push("current_chapter = ?");
      values.push(body.current_chapter);
    }

    // Note handling is special: text changes → delete old note chunks, embed new one.
    let noteChanged = false;
    let newNote: string | null = null;
    if (body.note !== undefined) {
      newNote = typeof body.note === "string" ? body.note.trim() || null : null;
      updates.push("note = ?");
      values.push(newNote);
      noteChanged = true;
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE books SET ${updates.join(", ")} WHERE id = ?`).run(...values, id);

    if (noteChanged) {
      // Delete prior note chunks for this book (cascade removes vectors? No — vec0
      // doesn't observe FK cascades, so do it explicitly).
      const oldNoteChunkIds = db
        .prepare("SELECT id FROM chunks WHERE book_id = ? AND chunk_type = 'note'")
        .all(id) as Array<{ id: number }>;
      if (oldNoteChunkIds.length > 0) {
        const placeholders = oldNoteChunkIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`)
          .run(...oldNoteChunkIds.map((c) => c.id));
        db.prepare("DELETE FROM chunks WHERE book_id = ? AND chunk_type = 'note'").run(id);
      }

      if (newNote) {
        const embedding = await embedDocument(newNote);
        const result = db
          .prepare(`
            INSERT INTO chunks (book_id, chapter_id, chapter_number, chunk_type, content, payload)
            VALUES (?, NULL, NULL, 'note', ?, ?)
          `)
          .run(id, newNote, JSON.stringify({ note: newNote }));
        db.prepare("INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)")
          .run(Number(result.lastInsertRowid), serializeVector(embedding));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/library/:id  — remove book entirely (cascades to chapters/chunks)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  // Clean up vector index manually (vec0 doesn't observe FK cascades).
  const chunkIds = db.prepare("SELECT id FROM chunks WHERE book_id = ?").all(id) as Array<{ id: number }>;
  if (chunkIds.length > 0) {
    const placeholders = chunkIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`)
      .run(...chunkIds.map((c) => c.id));
  }

  const result = db.prepare("DELETE FROM books WHERE id = ?").run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
