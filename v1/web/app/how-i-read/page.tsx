import Link from "next/link";
import { listLibraryBooks } from "@/lib/db";

export const dynamic = "force-dynamic";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const BAR_MAX_HEIGHT = 120;

export default async function HowIReadPage() {
  const books = await listLibraryBooks("finished");
  const finished = books.filter((b) => b.finished_at !== null);

  if (finished.length === 0) {
    return (
      <main className="container">
        <h1>How I Read</h1>
        <p className="subtitle">Your reading patterns, once you&rsquo;ve finished a few books.</p>
        <p className="empty">
          No finished books yet. Mark a book as finished in <Link href="/library">My Library</Link> to
          see stats here.
        </p>
      </main>
    );
  }

  // Last 12 months, oldest first.
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_FORMAT.format(d),
      count: 0,
    };
  });
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  for (const book of finished) {
    const d = new Date(book.finished_at!);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const idx = monthIndex.get(key);
    if (idx !== undefined) months[idx].count++;
  }

  const maxMonthCount = Math.max(1, ...months.map((m) => m.count));
  const inLast12Months = months.reduce((sum, m) => sum + m.count, 0);

  // Category breakdown, all-time.
  const categoryCounts = new Map<string, number>();
  for (const book of finished) {
    const cat = book.category?.trim() || "Uncategorized";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  const categories = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = Math.max(1, ...categories.map(([, count]) => count));

  return (
    <main className="container">
      <h1>How I Read</h1>
      <p className="subtitle">
        {finished.length} book{finished.length !== 1 ? "s" : ""} finished &middot; {inLast12Months} in the
        last 12 months
      </p>

      <h3>Books finished per month</h3>
      <div className="bar-chart">
        {months.map((m) => (
          <div key={m.key} className="bar-chart-col">
            <div
              className="bar-chart-bar"
              style={{ height: `${m.count === 0 ? 2 : Math.max(4, Math.round((m.count / maxMonthCount) * BAR_MAX_HEIGHT))}px` }}
            >
              {m.count > 0 && <span className="bar-chart-value">{m.count}</span>}
            </div>
            <div className="bar-chart-label">{m.label}</div>
          </div>
        ))}
      </div>

      <h3>By category</h3>
      <div className="category-chart">
        {categories.map(([category, count]) => (
          <div key={category} className="category-row">
            <div className="category-label">{category}</div>
            <div className="category-bar-track">
              <div className="category-bar" style={{ width: `${(count / maxCategoryCount) * 100}%` }} />
            </div>
            <div className="category-count">{count}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
