import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import QueryBox from "@/components/QueryBox";
import LibraryPanel from "@/components/LibraryPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface BookRow {
  id: number;
  title: string;
  author: string;
  chapter_count: number;
  reading_status: "want_to_read" | "reading" | "finished" | "abandoned";
  rating: number | null;
  note: string | null;
  cover_url: string | null;
  is_ingested: number;
}

interface ChapterRow {
  chapter_number: number;
  title: string | null;
  word_count: number;
  extraction: string;
}

interface Extraction {
  summary?: string;
  claims?: Array<{ claim: string; evidence?: string }>;
  frameworks?: Array<{ name: string; description?: string }>;
  memorable_passages?: Array<{ quote: string; context?: string }>;
  connections?: string[];
  questions_raised?: string[];
}

export default async function BookPage({ params }: PageProps) {
  const { id } = await params;
  const db = getDb();

  const book = db
    .prepare(`
      SELECT id, title, author, chapter_count, reading_status, rating, note,
             cover_url, is_ingested
      FROM books WHERE id = ?
    `)
    .get(id) as BookRow | undefined;

  if (!book) notFound();

  const chapterRows = book.is_ingested
    ? (db
        .prepare(`
          SELECT chapter_number, title, word_count, extraction
          FROM chapters
          WHERE book_id = ?
          ORDER BY chapter_number
        `)
        .all(id) as ChapterRow[])
    : [];

  const chapters = chapterRows.map((c) => ({
    ...c,
    extraction: JSON.parse(c.extraction) as Extraction,
  }));

  return (
    <main className="container">
      <p style={{ margin: 0 }}>
        <Link href="/">← Library</Link>
      </p>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 16 }}>
        {book.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover_url} alt="" style={{ width: 80, height: 120, objectFit: "cover", borderRadius: 4 }} />
        )}
        <div>
          <h1>{book.title}</h1>
          <p className="subtitle">
            {book.author}
            {book.is_ingested ? ` · ${book.chapter_count} chapters · queryable` : " · manual entry"}
          </p>
        </div>
      </div>

      <h2>Library</h2>
      <LibraryPanel
        bookId={book.id}
        initial={{
          reading_status: book.reading_status,
          rating: book.rating,
          note: book.note,
        }}
      />

      {book.is_ingested ? (
        <>
          <h2>Ask a question</h2>
          <QueryBox bookId={book.id} />

          <h2>Chapters</h2>
          {chapters.map((ch) => (
            <div key={ch.chapter_number} className="chapter-extraction">
              <div className="ch-title">
                Chapter {ch.chapter_number}: {ch.title || "(untitled)"}
              </div>
              {ch.extraction.summary && <p style={{ margin: "8px 0" }}>{ch.extraction.summary}</p>}
              <details>
                <summary>
                  {(ch.extraction.claims?.length || 0)} claims ·{" "}
                  {(ch.extraction.frameworks?.length || 0)} frameworks ·{" "}
                  {(ch.extraction.memorable_passages?.length || 0)} passages
                </summary>
                <pre style={{ fontSize: 12, marginTop: 12, overflow: "auto" }}>
                  {JSON.stringify(ch.extraction, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </>
      ) : (
        <p className="empty" style={{ marginTop: 32 }}>
          This is a manual entry — no chapters or chunks. To ask questions about it,
          run the v0 extraction on the EPUB and ingest with{" "}
          <code>python scripts/ingest.py …</code>. Your status, rating, and note will
          carry over.
        </p>
      )}
    </main>
  );
}
