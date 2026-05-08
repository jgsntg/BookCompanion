import Anthropic from "@anthropic-ai/sdk";

export interface RetrievedChunk {
  chunk_type: string;
  content: string;
  payload: Record<string, unknown>;
  chapter_number: number;
  chapter_title: string | null;
  book_title: string;
  book_author: string;
  distance: number;
}

const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are answering questions about a book on behalf of someone who is reading or has read it.
You will be given a question and a set of retrieved chunks from the reader's notes (claims, frameworks, memorable passages, connections, and questions raised by the text).

Your job:
1. Answer the question using ONLY the retrieved chunks. Do not draw on outside knowledge of the book.
2. Cite specific chunks inline using the format [Ch. N] where N is the chapter number.
3. If multiple chunks support a point, cite all of them: [Ch. 3, Ch. 7].
4. If the chunks don't actually answer the question, say so directly. Do not pad. Do not speculate. "The notes don't cover this" is a valid answer.
5. Be concise. The reader wants an answer, not an essay. 3-6 sentences is usually right; longer only if the question demands it.
6. Distinguish what the author argues from what the chunks merely mention. A claim with evidence > a passing connection.
7. When quoting a memorable passage, use quotation marks and cite the chapter.

Tone: a sharp, well-read friend who took good notes. Direct. Confident when the notes support it, honest when they don't.`;

export async function synthesize(
  question: string,
  chunks: RetrievedChunk[],
  bookContext?: { title: string; author: string }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const contextHeader = bookContext
    ? `Book: ${bookContext.title} by ${bookContext.author}\n\n`
    : "";

  const chunkText = chunks
    .map((c, i) => {
      const payload = JSON.stringify(c.payload, null, 2);
      return `<chunk index="${i + 1}" type="${c.chunk_type}" book="${c.book_title}" chapter="${c.chapter_number}" chapter_title="${c.chapter_title ?? ""}">
${payload}
</chunk>`;
    })
    .join("\n\n");

  const userMessage = `${contextHeader}Question: ${question}

Retrieved chunks (most relevant first):

${chunkText}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}
