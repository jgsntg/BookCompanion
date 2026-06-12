"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = "want_to_read" | "reading" | "finished" | "abandoned";

interface LookupResult {
  title: string;
  author: string;
  cover_url: string | null;
  year: number | null;
  ol_key: string | null;
}

export default function AddBookForm() {
  const router = useRouter();

  // Lookup state
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("finished");
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [blurb, setBlurb] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced lookup as the user types in the search box.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  function pickResult(r: LookupResult) {
    setTitle(r.title);
    setAuthor(r.author);
    setCoverUrl(r.cover_url);
    setSearch("");
    setResults([]);

    // Fetch the work's description/subjects to suggest a category + blurb.
    if (r.ol_key) {
      fetch(`/api/lookup/details?key=${encodeURIComponent(r.ol_key)}`)
        .then((res) => res.json())
        .then((data: { description: string | null; category: string | null }) => {
          if (data.category) setCategory(data.category);
          if (data.description) setBlurb(data.description);
        })
        .catch(() => {});
    }
  }

  async function submit() {
    if (!title.trim() || !author.trim()) {
      setError("Title and author are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          reading_status: status,
          rating,
          note: note.trim() || null,
          cover_url: coverUrl,
          category: category.trim() || null,
          blurb: blurb.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setError(`Already in your library. `);
          if (data.id) {
            // Send them to the existing book.
            router.push(`/book/${data.id}`);
          }
        } else {
          throw new Error(data.error || "Save failed");
        }
        return;
      }
      router.push(`/book/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="add-form">
      <div>
        <label>Search Open Library</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a title or author…"
        />
        {searching && <p className="empty" style={{ fontSize: 13, marginTop: 6 }}>Searching…</p>}
        {results.length > 0 && (
          <ul className="lookup-results">
            {results.map((r, i) => (
              <li key={i} onClick={() => pickResult(r)}>
                {r.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.cover_url} alt="" className="small-cover" />
                ) : (
                  <div className="small-cover" />
                )}
                <div>
                  <div style={{ fontWeight: 500 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {r.author}
                    {r.year ? ` · ${r.year}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "8px 0" }} />

      <div>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label>Author</label>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="finished">Finished</option>
            <option value="reading">Reading</option>
            <option value="want_to_read">Want to read</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Rating</label>
          <select
            value={rating ?? ""}
            onChange={(e) => setRating(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— no rating —</option>
            <option value="1">★</option>
            <option value="2">★★</option>
            <option value="3">★★★</option>
            <option value="4">★★★★</option>
            <option value="5">★★★★★</option>
          </select>
        </div>
      </div>

      <div>
        <label>Category (optional)</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Science fiction — suggested from Open Library when available"
        />
      </div>

      <div>
        <label>Blurb (optional)</label>
        <textarea
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          placeholder="Filled in from Open Library when available. Edit or clear as you like."
        />
      </div>

      <div>
        <label>Note · what I took from it (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One paragraph in your own words. This will be searchable across your library."
        />
      </div>

      {coverUrl && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Cover from Open Library will be saved.{" "}
          <button
            type="button"
            onClick={() => setCoverUrl(null)}
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}
          >
            remove
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div style={{ display: "flex", gap: 12 }}>
        <button className="button" onClick={submit} disabled={submitting}>
          {submitting ? "Saving…" : "Add to library"}
        </button>
        <button className="button ghost" onClick={() => router.push("/library")} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
