import { NextRequest, NextResponse } from "next/server";
import { deleteBook, getBook, ReadingStatus, replaceNoteChunk, updateBook } from "@/lib/db";
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
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();

    const existing = await getBook(bookId);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: {
      reading_status?: ReadingStatus;
      finished_at?: string | null;
      rating?: number | null;
      current_chapter?: number;
      note?: string | null;
      category?: string | null;
      blurb?: string | null;
      updated_at?: string;
    } = {};

    if (body.reading_status !== undefined) {
      if (!VALID_STATUSES.has(body.reading_status)) {
        return NextResponse.json({ error: "invalid reading_status" }, { status: 400 });
      }
      updates.reading_status = body.reading_status;

      // Auto-manage finished_at on status transitions, unless the caller
      // is explicitly setting finished_at in this same request.
      if (body.finished_at === undefined) {
        // Auto-set finished_at on transition into 'finished'.
        if (body.reading_status === "finished" && existing.reading_status !== "finished") {
          updates.finished_at = new Date().toISOString();
        }
        // Clear finished_at if moving back out of finished.
        if (body.reading_status !== "finished" && existing.reading_status === "finished") {
          updates.finished_at = null;
        }
      }
    }

    if (body.finished_at !== undefined) {
      if (body.finished_at !== null && typeof body.finished_at !== "string") {
        return NextResponse.json({ error: "finished_at must be a date string or null" }, { status: 400 });
      }
      updates.finished_at = body.finished_at;
    }

    if (body.rating !== undefined) {
      if (body.rating !== null && (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5)) {
        return NextResponse.json({ error: "rating must be 1-5 or null" }, { status: 400 });
      }
      updates.rating = body.rating;
    }

    if (body.current_chapter !== undefined) {
      updates.current_chapter = body.current_chapter;
    }

    if (body.category !== undefined) {
      updates.category = typeof body.category === "string" ? body.category.trim() || null : null;
    }

    if (body.blurb !== undefined) {
      updates.blurb = typeof body.blurb === "string" ? body.blurb.trim() || null : null;
    }

    // Note handling is special: text changes → delete old note chunks, embed new one.
    let noteChanged = false;
    let newNote: string | null = null;
    if (body.note !== undefined) {
      newNote = typeof body.note === "string" ? body.note.trim() || null : null;
      updates.note = newNote;
      noteChanged = true;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    updates.updated_at = new Date().toISOString();
    await updateBook(bookId, updates);

    if (noteChanged) {
      if (newNote) {
        const embedding = await embedDocument(newNote);
        await replaceNoteChunk(bookId, newNote, embedding);
      } else {
        await replaceNoteChunk(bookId, null);
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
  const bookId = Number(id);
  if (!Number.isInteger(bookId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await deleteBook(bookId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
