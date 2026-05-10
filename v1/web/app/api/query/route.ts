import { NextRequest, NextResponse } from "next/server";
import { getBook, matchChunks, textSearchChunks } from "@/lib/db";
import { embedQuery } from "@/lib/embeddings";
import { synthesize, RetrievedChunk } from "@/lib/synthesize";

const SEMANTIC_K = 10;
const TEXT_K = 5;
const FINAL_K = 8;

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

    const [semanticRows, textRows] = await Promise.all([
      matchChunks(numericBookId, queryEmbedding, SEMANTIC_K),
      textSearchChunks(numericBookId, question, TEXT_K),
    ]);

    // Merge: score = semantic_rank + text_rank (lower = better; absent = ABSENT penalty)
    const ABSENT = 20;
    const seen = new Map<string, { row: typeof semanticRows[0]; semRank: number; txtRank: number }>();

    semanticRows.forEach((r, i) => {
      const key = `${r.chapter_number}::${r.content}`;
      seen.set(key, { row: r, semRank: i, txtRank: ABSENT });
    });

    textRows.forEach((r, i) => {
      const key = `${r.chapter_number}::${r.content}`;
      if (seen.has(key)) {
        seen.get(key)!.txtRank = i;
      } else {
        seen.set(key, { row: r, semRank: ABSENT, txtRank: i });
      }
    });

    const chunks: RetrievedChunk[] = [...seen.values()]
      .sort((a, b) => (a.semRank + a.txtRank) - (b.semRank + b.txtRank))
      .slice(0, FINAL_K)
      .map(({ row }) => ({
        ...row,
        chapter_number: row.chapter_number ?? 0,
        payload: row.payload as Record<string, unknown>,
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
