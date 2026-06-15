import Link from "next/link";
import { getQueue, listLibraryBooks } from "@/lib/db";
import BookCard from "@/components/BookCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [books, upNext] = await Promise.all([listLibraryBooks("reading"), getQueue(5)]);

  return (
    <main className="container">
      <h1>Currently Reading</h1>
      <p className="subtitle">What&rsquo;s on your nightstand right now.</p>

      {books.length === 0 ? (
        <p className="empty">
          Nothing in progress right now. <Link href="/library">Browse your library</Link> and mark
          something as Reading.
        </p>
      ) : (
        <div className="book-grid">
          {books.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}

      {upNext.length > 0 && (
        <>
          <h2>
            Up Next{" "}
            <Link href="/queue" style={{ fontSize: 13, fontWeight: 400 }}>
              Manage queue →
            </Link>
          </h2>
          <div className="book-grid">
            {upNext.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
