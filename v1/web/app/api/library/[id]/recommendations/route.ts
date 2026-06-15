import { NextRequest, NextResponse } from "next/server";
import { getBook, listLibraryTitles, saveRecommendations } from "@/lib/db";
import { generateRecommendations } from "@/lib/recommend";

// POST /api/library/:id/recommendations
// Generates (or regenerates) "you might also like" suggestions for a book.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const book = await getBook(bookId);
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const excludeTitles = await listLibraryTitles();

    const recommendations = await generateRecommendations(
      {
        title: book.title,
        author: book.author,
        category: book.category,
        blurb: book.blurb,
        note: book.note,
        book_type: book.book_type,
      },
      excludeTitles
    );

    const generatedAt = await saveRecommendations(bookId, recommendations);

    return NextResponse.json({ recommendations, generated_at: generatedAt });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
