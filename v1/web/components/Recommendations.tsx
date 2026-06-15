"use client";

import { useState } from "react";
import type { RecommendationItem } from "@/lib/db";

interface Props {
  bookId: number;
  initial: RecommendationItem[] | null;
  generatedAt: string | null;
}

interface LookupResult {
  cover_url: string | null;
}

type AddState = "idle" | "adding" | "added" | "exists";

export default function Recommendations({ bookId, initial, generatedAt: initialGeneratedAt }: Props) {
  const [recs, setRecs] = useState<RecommendationItem[] | null>(initial?.length ? initial : null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addState, setAddState] = useState<Record<number, AddState>>({});
  const [addedLinks, setAddedLinks] = useState<Record<number, number>>({});

  async function fetchRecommendations() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/library/${bookId}/recommendations`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get suggestions");
      setRecs(data.recommendations);
      setGeneratedAt(data.generated_at);
      setAddState({});
      setAddedLinks({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function addToWantToRead(index: number, item: RecommendationItem) {
    setAddState((s) => ({ ...s, [index]: "adding" }));
    try {
      let coverUrl: string | null = null;
      try {
        const lookupRes = await fetch(
          `/api/lookup?q=${encodeURIComponent(`${item.title} ${item.author}`)}`
        );
        const lookupData = await lookupRes.json();
        coverUrl = (lookupData.results?.[0] as LookupResult | undefined)?.cover_url ?? null;
      } catch {
        // best-effort cover lookup; ignore failures
      }

      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          author: item.author,
          reading_status: "want_to_read",
          cover_url: coverUrl,
        }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setAddState((s) => ({ ...s, [index]: "exists" }));
        if (data.id) setAddedLinks((s) => ({ ...s, [index]: data.id }));
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to add book");

      setAddState((s) => ({ ...s, [index]: "added" }));
      setAddedLinks((s) => ({ ...s, [index]: data.id }));
    } catch (err) {
      setAddState((s) => ({ ...s, [index]: "idle" }));
      alert(err instanceof Error ? err.message : "Failed to add book");
    }
  }

  return (
    <>
      <h2>You might also like</h2>

      {recs && recs.length > 0 && (
        <div className="rec-list">
          {recs.map((item, i) => {
            const state = addState[i] ?? "idle";
            return (
              <div key={i} className="rec-card">
                <div className="rec-card-header">
                  <span className="title">{item.title}</span>
                  <span className="meta"> · {item.author}</span>
                </div>
                <p className="rec-reason">{item.reason}</p>
                {state === "added" || state === "exists" ? (
                  <a href={`/book/${addedLinks[i]}`} className="indicator">
                    {state === "added" ? "Added to want to read →" : "Already in your library →"}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => addToWantToRead(i, item)}
                    disabled={state === "adding"}
                  >
                    {state === "adding" ? "Adding…" : "+ Want to read"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: recs?.length ? 12 : 0 }}>
        <button type="button" className="button" onClick={fetchRecommendations} disabled={loading}>
          {loading ? "Thinking…" : recs?.length ? "Regenerate" : "Get suggestions"}
        </button>
        {generatedAt && !loading && (
          <span className="indicator">Suggested {new Date(generatedAt).toLocaleString()}</span>
        )}
      </div>
    </>
  );
}
