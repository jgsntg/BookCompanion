import Link from "next/link";
import type { LibraryBookRow } from "@/lib/db";

export default function BookCard({ book }: { book: LibraryBookRow }) {
  return (
    <Link href={`/book/${book.id}`} className="book-card">
      {book.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.cover_url} alt="" className="cover" />
      ) : (
        <div className="cover cover-placeholder">{book.title[0]}</div>
      )}
      <div className="book-card-body">
        <div className="title">{book.title}</div>
        <div className="meta">
          {book.author}
          {book.category ? ` · ${book.category}` : ""}
          {book.rating ? (
            <span className="stars-display">
              {" · "}
              {"★".repeat(book.rating)}
              {"☆".repeat(5 - book.rating)}
            </span>
          ) : (
            ""
          )}
          {book.is_ingested ? ` · ${book.chunk_count} chunks · queryable` : " · manual entry"}
        </div>
      </div>
    </Link>
  );
}
