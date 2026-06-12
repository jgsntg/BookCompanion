"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LibraryBookRow } from "@/lib/db";
import BookCard from "@/components/BookCard";

const STATUS_ORDER: LibraryBookRow["reading_status"][] = ["reading", "want_to_read", "finished", "abandoned"];
const STATUS_LABEL: Record<LibraryBookRow["reading_status"], string> = {
  reading: "Reading",
  want_to_read: "Want to read",
  finished: "Finished",
  abandoned: "Abandoned",
};

type SortMode = "recent" | "title" | "author";

export default function LibraryBrowser({ books }: { books: LibraryBookRow[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = books;
    if (q) {
      list = list.filter(
        (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
      );
    }
    if (sort === "title") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "author") {
      list = [...list].sort((a, b) => a.author.localeCompare(b.author));
    }
    return list;
  }, [books, search, sort]);

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    books: filtered.filter((b) => b.reading_status === status),
  })).filter((g) => g.books.length > 0);

  if (books.length === 0) {
    return (
      <p className="empty">
        Nothing here yet.{" "}
        <Link href="/library/add">Add a book manually</Link>, or run{" "}
        <code>python scripts/ingest.py path/to/extraction.json</code>.
      </p>
    );
  }

  return (
    <>
      <div className="library-controls">
        <input
          type="search"
          placeholder="Search by title or author…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="library-search"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="library-sort"
          aria-label="Sort by"
        >
          <option value="recent">Recently updated</option>
          <option value="title">Title (A–Z)</option>
          <option value="author">Author (A–Z)</option>
        </select>
      </div>

      {grouped.length === 0 ? (
        <p className="empty">No books match &ldquo;{search}&rdquo;.</p>
      ) : (
        grouped.map(({ status, books }) => (
          <section key={status}>
            <h3>
              {STATUS_LABEL[status]}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>({books.length})</span>
            </h3>
            <div className="book-grid">
              {books.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
