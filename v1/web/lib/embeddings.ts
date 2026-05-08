// Voyage AI embeddings.
// Two functions because input_type matters:
//   - "query" for retrieval-time questions
//   - "document" for ingest-time content
// Mixing them silently degrades retrieval quality.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3-lite";

async function embed(text: string, inputType: "query" | "document"): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: [text], model: MODEL, input_type: inputType }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

export const embedQuery = (text: string) => embed(text, "query");
export const embedDocument = (text: string) => embed(text, "document");
