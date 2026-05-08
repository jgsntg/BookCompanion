import Link from "next/link";
import Image from "next/image";
import { getDb } from "@/lib/db";

interface BookRow {
  id: number;
  title: string;
  author: string;
  reading_status: "want_to_read" | "reading" | "finished" | "abandoned";
  rating: number | null;
  cover_url: string | null;
  is_ingested: number;
  finished_at: string | null;
  created_at: string;
  chunk_count: number;
}

const STATUS_ORDER: BookRow["reading_status"][] = ["reading", "want_to_read", "finished", "abandoned"];
const STATUS_LABEL: Record<BookRow["reading_status"], string> = {
  reading: "Reading",
  want_to_read: "Want to read",
  finished: "Finished",
  abandoned: "Abandoned",
};

export default function HomePage() {
  const db = getDb();
  const books = db
    .prepare(`
      SELECT
        b.id, b.title, b.author, b.reading_status, b.rating, b.cover_url,
        b.is_ingested, b.finished_at, b.created_at,
        (SELECT COUNT(*) FROM chunks WHERE book_id = b.id) AS chunk_count
      FROM books b
      ORDER BY COALESCE(b.finished_at, b.updated_at) DESC
    `)
    .all() as BookRow[];

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    books: books.filter((b) => b.reading_status === status),
  })).filter((g) => g.books.length > 0);

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Library</h1>
        <Link href="/library/add" className="add-link">
          + Add a book
        </Link>
      </div>
      <p className="subtitle">
        Books you've read, are reading, or want to read. Ingested books are queryable.
      </p>

      {books.length === 0 ? (
        <p className="empty">
          Nothing here yet.{" "}
          <Link href="/library/add">Add a book manually</Link>, or run{" "}
          <code>python scripts/ingest.py path/to/extraction.json</code>.
        </p>
      ) : (
        grouped.map(({ status, books }) => (
          <section key={status}>
            <h3>
              {STATUS_LABEL[status]} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({books.length})</span>
            </h3>
            <ul className="book-list">
              {books.map((b) => (
                <li key={b.id}>
                  <Link href={`/book/${b.id}`} className="book-card with-cover">
                    {b.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.cover_url} alt="" className="cover" />
                    ) : (
                      <div className="cover cover-placeholder">{b.title[0]}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="title">{b.title}</div>
                      <div className="meta">
                        {b.author}
                        {b.rating ? ` · ${"★".repeat(b.rating)}${"☆".repeat(5 - b.rating)}` : ""}
                        {b.is_ingested ? ` · ${b.chunk_count} chunks · queryable` : " · manual entry"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
