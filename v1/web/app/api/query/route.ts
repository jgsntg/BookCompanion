import { NextRequest, NextResponse } from "next/server";
import { getDb, serializeVector } from "@/lib/db";
import { embedQuery } from "@/lib/embeddings";
import { synthesize, RetrievedChunk } from "@/lib/synthesize";

const TOP_K = 8;

export async function POST(req: NextRequest) {
  try {
    const { question, bookId } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    if (!bookId) {
      return NextResponse.json({ error: "Missing bookId" }, { status: 400 });
    }

    const db = getDb();

    const book = db
      .prepare("SELECT id, title, author FROM books WHERE id = ?")
      .get(bookId) as { id: number; title: string; author: string } | undefined;

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Embed the question with input_type="query" (matters for retrieval quality)
    const queryEmbedding = await embedQuery(question);

    // KNN over chunks scoped to this book.
    // sqlite-vec's vec0 doesn't support WHERE on payload columns directly,
    // so we filter via JOIN to chunks + chapters.
    const rows = db
      .prepare(`
        SELECT
          c.chunk_type,
          c.content,
          c.payload,
          c.chapter_number,
          ch.title AS chapter_title,
          b.title AS book_title,
          b.author AS book_author,
          v.distance AS distance
        FROM chunk_vectors v
        JOIN chunks c ON c.id = v.chunk_id
        JOIN chapters ch ON ch.id = c.chapter_id
        JOIN books b ON b.id = c.book_id
        WHERE v.embedding MATCH ?
          AND c.book_id = ?
          AND k = ?
        ORDER BY v.distance
      `)
      .all(serializeVector(queryEmbedding), bookId, TOP_K) as Array<{
        chunk_type: string;
        content: string;
        payload: string;
        chapter_number: number;
        chapter_title: string | null;
        book_title: string;
        book_author: string;
        distance: number;
      }>;

    const chunks: RetrievedChunk[] = rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payload),
    }));

    if (chunks.length === 0) {
      return NextResponse.json({
        answer: "No notes have been ingested for this book yet.",
        chunks: [],
      });
    }

    const answer = await synthesize(question, chunks, {
      title: book.title,
      author: book.author,
    });

    return NextResponse.json({ answer, chunks });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
