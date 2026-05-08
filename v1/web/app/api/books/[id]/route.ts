import { NextRequest, NextResponse } from "next/server";
import { getBook, getBookChapters } from "@/lib/db";

export async function GET(
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

  const chapters = await getBookChapters(book.id);

  return NextResponse.json({
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      chapter_count: book.chapter_count,
    },
    chapters,
  });
}
