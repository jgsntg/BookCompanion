"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LibraryBookRow } from "@/lib/db";

interface Props {
  queued: LibraryBookRow[];
  unqueued: LibraryBookRow[];
}

export default function QueueManager({ queued, unqueued }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(queued);
  const [busy, setBusy] = useState<number | null>(null);

  // Re-sync local order once the server component refreshes with fresh data.
  useEffect(() => {
    setItems(queued);
  }, [queued]);

  async function persistOrder(next: LibraryBookRow[]) {
    setItems(next);
    setBusy(-1);
    try {
      await fetch("/api/queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((b) => b.id) }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  }

  async function remove(bookId: number) {
    setBusy(bookId);
    try {
      await fetch(`/api/library/${bookId}/queue`, { method: "DELETE" });
      setItems((prev) => prev.filter((b) => b.id !== bookId));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function add(bookId: number) {
    setBusy(bookId);
    try {
      await fetch(`/api/library/${bookId}/queue`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2>Up Next</h2>
      {items.length === 0 ? (
        <p className="empty">
          Nothing queued yet. Add a book from the &ldquo;Want to read&rdquo; list below.
        </p>
      ) : (
        <div className="queue-list">
          {items.map((book, i) => (
            <div key={book.id} className="queue-row">
              {book.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.cover_url} alt="" className="small-cover" />
              ) : (
                <div className="small-cover" />
              )}
              <div className="queue-row-body">
                <Link href={`/book/${book.id}`} className="title">
                  {book.title}
                </Link>
                <div className="meta">{book.author}</div>
              </div>
              <div className="queue-row-actions">
                <button
                  type="button"
                  className="button ghost icon"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || busy !== null}
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="button ghost icon"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1 || busy !== null}
                  aria-label="Move down"
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => remove(book.id)}
                  disabled={busy !== null}
                >
                  {busy === book.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Want to read</h2>
      {unqueued.length === 0 ? (
        <p className="empty">
          Everything on your &ldquo;want to read&rdquo; list is already queued.
        </p>
      ) : (
        <div className="queue-list">
          {unqueued.map((book) => (
            <div key={book.id} className="queue-row">
              {book.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.cover_url} alt="" className="small-cover" />
              ) : (
                <div className="small-cover" />
              )}
              <div className="queue-row-body">
                <Link href={`/book/${book.id}`} className="title">
                  {book.title}
                </Link>
                <div className="meta">{book.author}</div>
              </div>
              <div className="queue-row-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => add(book.id)}
                  disabled={busy !== null}
                >
                  {busy === book.id ? "Adding…" : "+ Add to queue"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
