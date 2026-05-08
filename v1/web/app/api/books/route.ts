import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: NextRequest) {
  const db = getDb();
  const books = db
    .prepare(`
      SELECT
        b.id,
        b.title,
        b.author,
        b.chapter_count,
        b.created_at,
        (SELECT COUNT(*) FROM chunks WHERE book_id = b.id) AS chunk_count
      FROM books b
      ORDER BY b.created_at DESC
    `)
    .all();
  return NextResponse.json({ books });
}
