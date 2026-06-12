"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Status = "want_to_read" | "reading" | "finished" | "abandoned";

interface Props {
  bookId: number;
  initial: {
    reading_status: Status;
    rating: number | null;
    note: string | null;
    category: string | null;
    finished_at: string | null;
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function LibraryPanel({ bookId, initial }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial.reading_status);
  const [rating, setRating] = useState<number | null>(initial.rating);
  const [note, setNote] = useState<string>(initial.note ?? "");
  const [category, setCategory] = useState<string>(initial.category ?? "");
  const [finishedDate, setFinishedDate] = useState<string>(initial.finished_at?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [, startTransition] = useTransition();

  function onStatusChange(next: Status) {
    setStatus(next);
    if (next === "finished" && !finishedDate) {
      setFinishedDate(todayStr());
    }
  }

  const initialFinishedDate = initial.finished_at?.slice(0, 10) ?? "";
  const dirty =
    status !== initial.reading_status ||
    rating !== initial.rating ||
    (note || null) !== (initial.note ?? null) ||
    (category || null) !== (initial.category ?? null) ||
    (status === "finished" ? finishedDate : "") !== initialFinishedDate;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/library/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reading_status: status,
          rating,
          note: note.trim() ? note : null,
          category: category.trim() || null,
          finished_at: status === "finished" ? finishedDate || todayStr() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setSavedAt(new Date());
      // Refresh server data so the next render reflects new initial state.
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="status-panel">
      <div className="field">
        <label>Status</label>
        <select value={status} onChange={(e) => onStatusChange(e.target.value as Status)}>
          <option value="want_to_read">Want to read</option>
          <option value="reading">Reading</option>
          <option value="finished">Finished</option>
          <option value="abandoned">Abandoned</option>
        </select>
      </div>

      <div className="field">
        <label>Category</label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Science fiction"
        />
      </div>

      {status === "finished" && (
        <div className="field">
          <label>Finished date</label>
          <input
            type="date"
            value={finishedDate}
            onChange={(e) => setFinishedDate(e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <label>Rating</label>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={rating && n <= rating ? "filled" : ""}
              onClick={() => setRating(n === rating ? null : n)}
              aria-label={`${n} stars`}
            >
              ★
            </button>
          ))}
          {rating !== null && (
            <button type="button" className="clear" onClick={() => setRating(null)}>
              clear
            </button>
          )}
        </div>
      </div>

      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>Note · what I took from it</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One paragraph. Future-you will thank you."
        />
      </div>

      <div className="save-row">
        <button className="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt && !dirty && <span className="indicator">Saved {savedAt.toLocaleTimeString()}</span>}
        {dirty && !saving && <span className="indicator">Unsaved changes</span>}
      </div>
    </div>
  );
}
