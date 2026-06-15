import { NextRequest, NextResponse } from "next/server";
import { addToQueue, getBook, removeFromQueue } from "@/lib/db";

// POST /api/library/:id/queue — add a "want to read" book to the reading queue.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const book = await getBook(bookId);
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (book.reading_status !== "want_to_read") {
    return NextResponse.json(
      { error: "Only 'want to read' books can be queued" },
      { status: 400 }
    );
  }

  await addToQueue(bookId);
  return NextResponse.json({ ok: true });
}

// DELETE /api/library/:id/queue — remove a book from the reading queue.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await removeFromQueue(bookId);
  return NextResponse.json({ ok: true });
}
