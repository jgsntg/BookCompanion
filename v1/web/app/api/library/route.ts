import { NextRequest, NextResponse } from "next/server";
import {
  createBook,
  getBookByDedupeKey,
  listLibraryBooks,
  ReadingStatus,
  replaceNoteChunk,
} from "@/lib/db";
import { makeDedupeKey } from "@/lib/dedupe";
import { embedDocument } from "@/lib/embeddings";

// GET /api/library?status=finished
// Returns library books, optionally filtered by reading_status.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const validStatuses = new Set(["want_to_read", "reading", "finished", "abandoned"]);
  const rows = await listLibraryBooks(
    status && validStatuses.has(status) ? (status as ReadingStatus) : undefined
  );

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

    const existing = await getBookByDedupeKey(dedupeKey);

    if (existing) {
      return NextResponse.json(
        { error: "A book with this title and author already exists.", id: existing.id },
        { status: 409 }
      );
    }

    const trimmedNote = note?.trim() || null;
    const bookId = await createBook({
      title: title.trim(),
      author: author.trim(),
      dedupe_key: dedupeKey,
      reading_status: status as ReadingStatus,
      rating: rating ?? null,
      note: trimmedNote,
      cover_url: cover_url ?? null,
      finished_at: finishedAt,
    });

    // If a note was provided, embed it as a chunk so it shows up in retrieval.
    if (trimmedNote) {
      const embedding = await embedDocument(trimmedNote);
      await replaceNoteChunk(bookId, trimmedNote, embedding);
    }

    return NextResponse.json({ id: bookId }, { status: 201 });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
