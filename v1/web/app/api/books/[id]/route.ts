import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const book = db
    .prepare("SELECT id, title, author, chapter_count FROM books WHERE id = ?")
    .get(id);

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const chapters = db
    .prepare(`
      SELECT chapter_number, title, word_count, extraction
      FROM chapters
      WHERE book_id = ?
      ORDER BY chapter_number
    `)
    .all(id) as Array<{
      chapter_number: number;
      title: string | null;
      word_count: number;
      extraction: string;
    }>;

  return NextResponse.json({
    book,
    chapters: chapters.map((c) => ({
      ...c,
      extraction: JSON.parse(c.extraction),
    })),
  });
}
