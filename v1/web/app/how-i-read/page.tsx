import Link from "next/link";
import { listLibraryBooks } from "@/lib/db";

export const dynamic = "force-dynamic";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const BAR_MAX_HEIGHT = 120;

type Period = "12m" | "2y" | "5y" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "12m", label: "12 months" },
  { key: "2y", label: "2 years" },
  { key: "5y", label: "5 years" },
  { key: "all", label: "Lifetime" },
];

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function HowIReadPage({ searchParams }: PageProps) {
  const { period: periodParam } = await searchParams;
  const period: Period = PERIODS.some((p) => p.key === periodParam) ? (periodParam as Period) : "12m";

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

  const now = new Date();
  const currentYear = now.getUTCFullYear();

  // Build buckets for the selected period. Short periods are bucketed by
  // month; longer ones by year (otherwise the chart gets too wide/sparse).
  let buckets: { key: string; label: string; href: string; count: number }[];
  let periodLabel: string;
  let chartTitle: string;

  if (period === "5y" || period === "all") {
    let startYear: number;
    if (period === "5y") {
      startYear = currentYear - 4;
    } else {
      const earliest = Math.min(...finished.map((b) => new Date(b.finished_at!).getUTCFullYear()));
      startYear = Math.min(earliest, currentYear);
    }
    buckets = [];
    for (let y = startYear; y <= currentYear; y++) {
      buckets.push({ key: String(y), label: String(y), href: `/how-i-read/books?year=${y}`, count: 0 });
    }
    periodLabel = period === "5y" ? "the last 5 years" : "your lifetime";
    chartTitle = "Books finished per year";
  } else {
    const numMonths = period === "2y" ? 24 : 12;
    buckets = Array.from({ length: numMonths }, (_, i) => {
      const d = new Date(Date.UTC(currentYear, now.getUTCMonth() - (numMonths - 1 - i), 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return { key, label: MONTH_FORMAT.format(d), href: `/how-i-read/books?month=${key}`, count: 0 };
    });
    periodLabel = period === "2y" ? "the last 2 years" : "the last 12 months";
    chartTitle = "Books finished per month";
  }

  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));
  for (const book of finished) {
    const d = new Date(book.finished_at!);
    const key =
      period === "5y" || period === "all"
        ? String(d.getUTCFullYear())
        : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const idx = bucketIndex.get(key);
    if (idx !== undefined) buckets[idx].count++;
  }

  const maxBucketCount = Math.max(1, ...buckets.map((b) => b.count));
  const inPeriod = buckets.reduce((sum, b) => sum + b.count, 0);

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
        {finished.length} book{finished.length !== 1 ? "s" : ""} finished &middot; {inPeriod} in {periodLabel}
      </p>

      <div className="period-tabs">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "12m" ? "/how-i-read" : `/how-i-read?period=${p.key}`}
            className={`period-tab${p.key === period ? " active" : ""}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <h3>{chartTitle}</h3>
      <div className="bar-chart">
        {buckets.map((b) => (
          <Link key={b.key} href={b.href} className="bar-chart-col">
            <div
              className="bar-chart-bar"
              style={{ height: `${b.count === 0 ? 2 : Math.max(4, Math.round((b.count / maxBucketCount) * BAR_MAX_HEIGHT))}px` }}
            >
              {b.count > 0 && <span className="bar-chart-value">{b.count}</span>}
            </div>
            <div className="bar-chart-label">{b.label}</div>
          </Link>
        ))}
      </div>

      <h3>By category</h3>
      <div className="category-chart">
        {categories.map(([category, count]) => (
          <Link
            key={category}
            href={`/how-i-read/books?category=${encodeURIComponent(category)}`}
            className="category-row"
          >
            <div className="category-label">{category}</div>
            <div className="category-bar-track">
              <div className="category-bar" style={{ width: `${(count / maxCategoryCount) * 100}%` }} />
            </div>
            <div className="category-count">{count}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
