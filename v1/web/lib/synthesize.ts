import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

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

const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const OPENAI_MODEL = "gpt-4o";

const NONFICTION_SYSTEM_PROMPT = `You are answering questions about a book on behalf of someone who is reading or has read it.
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

const FICTION_SYSTEM_PROMPT = `You are answering questions about a fiction book on behalf of someone who is reading or has read it.
You will be given a question and retrieved chunks from the reader's notes. Chunk types:
- "event": a key plot event; the payload includes "characters_involved" listing who drove or was affected by it
- "character": a character description; the content is "Name: description"
- "location": a place description; the content is "Name: description"
- "claim": a thematic argument the book advances
- "passage": a memorable quote
- "connection" / "question": thematic tags and open questions

Your job:
1. Answer the question using ONLY the retrieved chunks. Do not draw on outside knowledge of the book.
2. Cite specific chunks inline using the format [Ch. N] where N is the chapter number.
3. If multiple chunks support a point, cite all of them: [Ch. 3, Ch. 7].
4. For "who is X?" questions, lead with character chunks that name X. Describe their role concisely.
5. For "what happened in chapter X?" or "who did Y?" questions, lead with event chunks. Use characters_involved to identify the right actors.
6. If the chunks don't actually answer the question, say so directly. "The notes don't cover this" is a valid answer.
7. Be concise. 3-6 sentences is usually right; longer only if the question demands it.
8. When quoting a memorable passage, use quotation marks and cite the chapter.

Tone: a sharp reader who took great notes. Direct. Confident when the notes support it, honest when they don't.`;

export async function synthesize(
  question: string,
  chunks: RetrievedChunk[],
  bookContext?: { title: string; author: string; bookType?: string | null }
): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  const systemPrompt =
    bookContext?.bookType === "fiction"
      ? FICTION_SYSTEM_PROMPT
      : NONFICTION_SYSTEM_PROMPT;

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

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    return response.choices[0].message.content ?? "";
  }

  // Default: Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}
