import { NextRequest, NextResponse } from "next/server";
import { getDb, serializeVector } from "@/lib/db";
import { embedQuery } from "@/lib/embeddings";
import { synthesize, RetrievedChunk, BookType } from "@/lib/synthesize";

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
      .prepare("SELECT id, title, author, book_type FROM books WHERE id = ?")
      .get(bookId) as
      | { id: number; title: string; author: string; book_type: BookType }
      | undefined;

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const queryEmbedding = await embedQuery(question);

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
        LEFT JOIN chapters ch ON ch.id = c.chapter_id
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
        chapter_number: number | null;
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
      book_type: book.book_type,
    });

    return NextResponse.json({ answer, chunks });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
