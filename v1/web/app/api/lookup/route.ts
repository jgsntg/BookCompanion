import { NextRequest, NextResponse } from "next/server";

// Open Library search API. No key needed.
// Docs: https://openlibrary.org/dev/docs/api/search
//
// We return a small, opinionated subset: title, author(s), cover URL, year.
// Cover image URLs follow https://covers.openlibrary.org/b/id/{cover_i}-M.jpg

interface OLDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  key?: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=title,author_name,cover_i,first_publish_year,key`;
  const res = await fetch(url, {
    headers: { "User-Agent": "audiobook-brain (personal project)" },
    // Cache for 1h — these results don't change.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json({ results: [], error: `Open Library: ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const results = (data.docs as OLDoc[])
    .filter((d) => d.title && d.author_name?.length)
    .slice(0, 10)
    .map((d) => ({
      title: d.title!,
      author: d.author_name!.join(", "),
      cover_url: d.cover_i
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
        : null,
      year: d.first_publish_year ?? null,
      ol_key: d.key ?? null,
    }));

  return NextResponse.json({ results });
}
