import Link from "next/link";
import { listLibraryBooks } from "@/lib/db";
import LibraryBrowser from "@/components/LibraryBrowser";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const books = await listLibraryBooks();

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>My Library</h1>
        <Link href="/library/add" className="add-link">
          + Add a book
        </Link>
      </div>
      <p className="subtitle">
        Books you&rsquo;ve read, are reading, or want to read. Ingested books are queryable.
      </p>

      <LibraryBrowser books={books} />
    </main>
  );
}
