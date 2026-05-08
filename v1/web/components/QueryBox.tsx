"use client";

import { useState } from "react";

interface RetrievedChunk {
  chunk_type: string;
  content: string;
  payload: Record<string, unknown>;
  chapter_number: number;
  chapter_title: string | null;
  distance: number;
}

interface QueryBoxProps {
  bookId: number;
}

export default function QueryBox({ bookId }: QueryBoxProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [chunks, setChunks] = useState<RetrievedChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setChunks([]);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, bookId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");
      setAnswer(data.answer);
      setChunks(data.chunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="query-form">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder='e.g. "Summarize chapter 3" or "Find the passage about compounding decisions"'
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <button onClick={handleSubmit} disabled={loading || !question.trim()}>
        {loading ? "Thinking…" : "Ask (⌘+Enter)"}
      </button>

      {error && <div className="error">{error}</div>}

      {answer && (
        <>
          <div className="answer">{answer}</div>

          <details className="chunks">
            <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>
              Sources ({chunks.length} chunks retrieved)
            </summary>
            <div style={{ marginTop: 12 }}>
              {chunks.map((c, i) => (
                <div key={i} className="chunk">
                  <div className="chunk-meta">
                    Ch. {c.chapter_number} · {c.chunk_type} · distance {c.distance.toFixed(3)}
                  </div>
                  <div className="chunk-content">{c.content}</div>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
