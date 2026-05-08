import { NextRequest, NextResponse } from "next/server";
import { getBook, matchChunks } from "@/lib/db";
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

    const numericBookId = Number(bookId);
    if (!Number.isInteger(numericBookId)) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const book = await getBook(numericBookId);
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Embed the question with input_type="query" (matters for retrieval quality)
    const queryEmbedding = await embedQuery(question);

    const rows = await matchChunks(numericBookId, queryEmbedding, TOP_K);

    const chunks: RetrievedChunk[] = rows.map((r) => ({
      ...r,
      chapter_number: r.chapter_number ?? 0,
      payload: r.payload as Record<string, unknown>,
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
      bookType: book.book_type,
    });

    return NextResponse.json({ answer, chunks });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
