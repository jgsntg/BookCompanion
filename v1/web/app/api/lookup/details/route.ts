import { NextRequest, NextResponse } from "next/server";

// Open Library "work" detail lookup. Used after picking a search result to
// suggest a category (from subjects) and a blurb (from description).
// Docs: https://openlibrary.org/dev/docs/api/books

interface OLWork {
  description?: string | { value?: string };
  subjects?: string[];
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key")?.trim();
  if (!key || !key.startsWith("/works/")) {
    return NextResponse.json({ description: null, category: null });
  }

  const res = await fetch(`https://openlibrary.org${key}.json`, {
    headers: { "User-Agent": "audiobook-brain (personal project)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json({ description: null, category: null });
  }

  const data: OLWork = await res.json();

  const description =
    typeof data.description === "string"
      ? data.description
      : data.description?.value ?? null;

  // Drop NYT bestseller-list tags and similar machine subjects (e.g.
  // "nyt:trade-fiction-paperback=2020-01-26"), keep the first human-readable one.
  const cleanSubjects = (data.subjects ?? []).filter(
    (s) => !s.includes("=") && !s.includes(":")
  );
  const category = cleanSubjects[0] ?? null;

  return NextResponse.json({ description, category });
}
