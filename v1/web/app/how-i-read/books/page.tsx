import Link from "next/link";
import { listLibraryBooks } from "@/lib/db";
import BookCard from "@/components/BookCard";

export const dynamic = "force-dynamic";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string; category?: string }>;
}

export default async function HowIReadBooksPage({ searchParams }: PageProps) {
  const { month, year, category } = await searchParams;

  const books = await listLibraryBooks("finished");
  const finished = books.filter((b) => b.finished_at !== null);

  let filtered = finished;
  let heading = "Finished books";

  if (month) {
    filtered = finished.filter((b) => {
      const d = new Date(b.finished_at!);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return key === month;
    });
    const [y, m] = month.split("-").map(Number);
    heading = Number.isInteger(y) && Number.isInteger(m)
      ? MONTH_FORMAT.format(new Date(Date.UTC(y, m - 1, 1)))
      : "Finished books";
  } else if (year) {
    const y = Number(year);
    filtered = finished.filter((b) => new Date(b.finished_at!).getUTCFullYear() === y);
    heading = Number.isInteger(y) ? String(y) : "Finished books";
  } else if (category) {
    filtered = finished.filter((b) => (b.category?.trim() || "Uncategorized") === category);
    heading = category;
  }

  filtered = [...filtered].sort(
    (a, b) => Date.parse(b.finished_at!) - Date.parse(a.finished_at!)
  );

  return (
    <main className="container">
      <p style={{ margin: 0 }}>
        <Link href="/how-i-read">← How I Read</Link>
      </p>

      <h1>{heading}</h1>
      <p className="subtitle">
        {filtered.length} book{filtered.length !== 1 ? "s" : ""} finished
      </p>

      {filtered.length === 0 ? (
        <p className="empty">No books here.</p>
      ) : (
        <div className="book-grid">
          {filtered.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}
    </main>
  );
}
