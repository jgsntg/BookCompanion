import Anthropic from "@anthropic-ai/sdk";

export interface RetrievedChunk {
  chunk_type: string;
  content: string;
  payload: Record<string, unknown>;
  chapter_number: number | null;
  chapter_title: string | null;
  book_title: string;
  book_author: string;
  distance: number;
}

export type BookType = "fiction" | "nonfiction" | null;

const MODEL = "claude-sonnet-4-5";

const COMMON_RULES = `Your job:
1. Answer the question using ONLY the retrieved chunks. Do not draw on outside knowledge of the book.
2. Cite specific chunks inline using [Ch. N] where N is the chapter number. For chunks without a chapter (e.g. user notes), cite as [note]. If multiple chunks support a point, cite all of them: [Ch. 3, Ch. 7].
3. If the chunks don't actually answer the question, say so directly. "The notes don't cover this" is a valid answer. Don't pad. Don't speculate.
4. Be concise. The reader wants an answer, not an essay. 3-6 sentences is usually right; longer only if the question demands it.
5. When quoting a memorable passage, use quotation marks and cite the chapter.

Tone: a sharp, well-read friend who took good notes. Direct. Confident when the notes support it, honest when they don't.`;

const NONFICTION_PROMPT = `You are answering questions about a non-fiction book on behalf of someone who is reading or has read it.
You will be given a question and a set of retrieved chunks from the reader's notes — claims the author makes, frameworks the author introduces, memorable passages, connections to other ideas, and questions the chapter raises.

${COMMON_RULES}

6. Distinguish what the author argues (claims with evidence) from what the chunks merely mention (passing connections). A claim is stronger than a connection.
7. When citing a framework, name it. "The author's framework of X has components Y and Z" is more useful than "the author has a framework."`;

const FICTION_PROMPT = `You are answering questions about a work of fiction on behalf of someone who is reading or has read it.
You will be given a question and a set of retrieved chunks from the reader's notes. For fiction, chunks include:
- characters: who they are, their role, relationships, traits
- events: plot beats — actions, decisions, arrivals, deaths, reveals — with the characters involved
- locations: places that matter to the plot
- claims: thematic arguments the chapter advances
- memorable_passages, connections, questions_raised, summary

${COMMON_RULES}

6. For "what happened" questions, lead with event chunks and use character chunks to identify who was involved. Each event chunk's payload may include a "characters_involved" list — use it.
7. For "who is X" questions, lead with the character chunk for X. If multiple character chunks across chapters describe X, synthesize them; cite each chapter.
8. For "who decided to do Y" questions, scan event chunks for the decision and report the character(s) involved.
9. Don't recap plot. Answer the specific question with the specific chunk that addresses it.
10. Distinguish narrative fact (what happens, who's where) from thematic argument (what the work seems to be saying through events). The latter lives in claim chunks.`;

const UNKNOWN_PROMPT = `You are answering questions about a book on behalf of someone who is reading or has read it.
You will be given a question and a set of retrieved chunks from the reader's notes. The book's type (fiction or non-fiction) hasn't been classified, so adapt your tone to whatever the chunks suggest.

${COMMON_RULES}`;

function systemPromptFor(bookType: BookType): string {
  switch (bookType) {
    case "fiction":
      return FICTION_PROMPT;
    case "nonfiction":
      return NONFICTION_PROMPT;
    default:
      return UNKNOWN_PROMPT;
  }
}

export async function synthesize(
  question: string,
  chunks: RetrievedChunk[],
  bookContext: { title: string; author: string; book_type: BookType }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const header = `Book: ${bookContext.title} by ${bookContext.author}${
    bookContext.book_type ? ` (${bookContext.book_type})` : ""
  }\n\n`;

  const chunkText = chunks
    .map((c, i) => {
      const payload = JSON.stringify(c.payload, null, 2);
      const chapterAttr =
        c.chapter_number !== null
          ? `chapter="${c.chapter_number}" chapter_title="${c.chapter_title ?? ""}"`
          : `chapter="note"`;
      return `<chunk index="${i + 1}" type="${c.chunk_type}" book="${c.book_title}" ${chapterAttr}>
${payload}
</chunk>`;
    })
    .join("\n\n");

  const userMessage = `${header}Question: ${question}

Retrieved chunks (most relevant first):

${chunkText}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPromptFor(bookContext.book_type),
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}
