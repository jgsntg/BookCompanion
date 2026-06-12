import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, getBookChapters } from "@/lib/db";
import QueryBox from "@/components/QueryBox";
import LibraryPanel from "@/components/LibraryPanel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Extraction {
  summary?: string;
  claims?: Array<{ claim: string; evidence?: string; confidence?: string }>;
  frameworks?: Array<{ name: string; description?: string; components?: string[] }>;
  memorable_passages?: Array<{ quote: string; context?: string }>;
  connections?: string[];
  questions_raised?: string[];
  key_events?: Array<{ event: string; characters_involved?: string[] }>;
  characters?: Array<{ name: string; description?: string; first_appearance?: boolean }>;
  locations?: Array<{ name: string; description?: string }>;
}

export default async function BookPage({ params }: PageProps) {
  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId)) notFound();

  const book = await getBook(bookId);
  if (!book) notFound();

  const chapterRows = book.is_ingested ? await getBookChapters(book.id) : [];

  const chapters = chapterRows.map((c) => ({
    ...c,
    extraction: c.extraction as Extraction,
  }));

  return (
    <main className="container">
      <p style={{ margin: 0 }}>
        <Link href="/library">← My Library</Link>
      </p>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 16 }}>
        {book.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover_url} alt="" className="detail-cover" />
        )}
        <div>
          <h1>{book.title}</h1>
          <p className="subtitle">
            {book.author}
            {book.is_ingested ? ` · ${book.chapter_count} chapters · queryable` : " · manual entry"}
          </p>
          {book.blurb && <p className="blurb">{book.blurb}</p>}
        </div>
      </div>

      <h2>Library</h2>
      <LibraryPanel
        bookId={book.id}
        initial={{
          reading_status: book.reading_status,
          rating: book.rating,
          note: book.note,
          category: book.category,
          finished_at: book.finished_at,
        }}
      />

      {book.is_ingested ? (
        <>
          <h2>Ask a question</h2>
          <QueryBox bookId={book.id} />

          <h2>Chapters</h2>
          {chapters.map((ch) => {
            const ex = ch.extraction;
            const claimCount = ex.claims?.length || 0;
            const eventCount = ex.key_events?.length || 0;
            const charCount = ex.characters?.length || 0;
            const passageCount = ex.memorable_passages?.length || 0;
            const counts = [
              claimCount && `${claimCount} claim${claimCount !== 1 ? "s" : ""}`,
              eventCount && `${eventCount} event${eventCount !== 1 ? "s" : ""}`,
              charCount && `${charCount} character${charCount !== 1 ? "s" : ""}`,
              passageCount && `${passageCount} passage${passageCount !== 1 ? "s" : ""}`,
            ].filter(Boolean).join(" · ");

            return (
              <div key={ch.chapter_number} className="chapter-extraction">
                <div className="ch-title">
                  Chapter {ch.chapter_number}: {ch.title || "(untitled)"}
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 13, marginLeft: 8 }}>
                    {(ch.word_count ?? 0).toLocaleString()} words
                  </span>
                </div>

                {ex.summary && <p style={{ margin: "8px 0 0", fontSize: 15 }}>{ex.summary}</p>}

                {counts && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 13 }}>
                      {counts}
                    </summary>
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>

                      {ex.key_events && ex.key_events.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 6 }}>Key events</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                            {ex.key_events.map((e, i) => (
                              <li key={i}>
                                {e.event}
                                {e.characters_involved && e.characters_involved.length > 0 && (
                                  <span style={{ color: "var(--muted)" }}> — {e.characters_involved.join(", ")}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {ex.characters && ex.characters.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 6 }}>Characters</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {ex.characters.map((c, i) => (
                              <div key={i} style={{ fontSize: 14 }}>
                                <span style={{ fontWeight: 600 }}>{c.name}</span>
                                {c.first_appearance && (
                                  <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 6, fontWeight: 500 }}>first appearance</span>
                                )}
                                {c.description && (
                                  <span style={{ color: "var(--muted)" }}> — {c.description}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ex.claims && ex.claims.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 6 }}>Claims</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {ex.claims.map((c, i) => (
                              <div key={i} style={{ fontSize: 14 }}>
                                <div>{c.claim}</div>
                                {c.evidence && <div style={{ color: "var(--muted)", marginTop: 2 }}>{c.evidence}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ex.memorable_passages && ex.memorable_passages.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 6 }}>Passages</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {ex.memorable_passages.map((p, i) => (
                              <div key={i} style={{ fontSize: 14 }}>
                                <div style={{ fontStyle: "italic" }}>&ldquo;{p.quote}&rdquo;</div>
                                {p.context && <div style={{ color: "var(--muted)", marginTop: 2 }}>{p.context}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ex.locations && ex.locations.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 6 }}>Locations</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {ex.locations.map((l, i) => (
                              <div key={i} style={{ fontSize: 14 }}>
                                <span style={{ fontWeight: 600 }}>{l.name}</span>
                                {l.description && <span style={{ color: "var(--muted)" }}> — {l.description}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <p className="empty" style={{ marginTop: 32 }}>
          This is a manual entry — no chapters or chunks. To ask questions about it,
          run the v0 extraction on the EPUB and ingest with{" "}
          <code>python scripts/ingest.py …</code>. Your status, rating, and note will
          carry over.
        </p>
      )}
    </main>
  );
}
