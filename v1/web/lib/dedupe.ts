// Normalize title + author into a stable dedupe key.
// The same logic is mirrored in scripts/ingest.py — keep them in sync.
//
// Handles common EPUB metadata messiness:
// - "Last, First" → "First Last"
// - case differences
// - extra whitespace
// - surrounding punctuation/quotes
// - "&" vs "and"
//
// This is best-effort, not perfect. If it fails to dedupe, the user
// deletes the duplicate and re-adds. Acceptable for v1.

function normalizeAuthor(raw: string): string {
  let s = raw.trim();
  // "Last, First" → "First Last"
  if (s.includes(",") && s.split(",").length === 2) {
    const [last, first] = s.split(",").map((p) => p.trim());
    // Avoid rewriting comma-separated coauthors like
    // "Marily Nika, Diego Granados".
    if (last && first && !(last.split(/\s+/).length > 1 && first.split(/\s+/).length > 1)) {
      s = `${first} ${last}`;
    }
  }
  return normalize(s);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, " ")  // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

export function makeDedupeKey(title: string, author: string): string {
  return `${normalize(title)}::${normalizeAuthor(author)}`;
}
