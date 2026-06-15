import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { RecommendationItem } from "./db";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = "gpt-4o";

const SYSTEM_PROMPT = `You recommend books to someone who just finished a book, based on its theme, genre, and style.

Given the finished book's metadata and the reader's own note about it, suggest up to 5 books they would likely enjoy next.

Rules:
1. Do not recommend any book already in the reader's library (a list is provided — match on title and author, case-insensitively).
2. For each suggestion, give a one-sentence reason tied to *why* it follows from this specific book — shared themes, structure, tone, or ideas. Not just "same genre."
3. Respond with ONLY a JSON array, no prose, no markdown code fences: [{"title": "...", "author": "...", "reason": "..."}]`;

interface BookContext {
  title: string;
  author: string;
  category: string | null;
  blurb: string | null;
  note: string | null;
  book_type: string | null;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

function parseRecommendations(text: string): RecommendationItem[] {
  const parsed = JSON.parse(stripFences(text));
  if (!Array.isArray(parsed)) {
    throw new Error("Recommendation response was not a JSON array");
  }

  return parsed
    .filter(
      (item): item is RecommendationItem =>
        typeof item?.title === "string" &&
        typeof item?.author === "string" &&
        typeof item?.reason === "string"
    )
    .slice(0, 5);
}

export async function generateRecommendations(
  book: BookContext,
  excludeTitles: Array<{ title: string; author: string }>
): Promise<RecommendationItem[]> {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  const excludeList = excludeTitles
    .slice(0, 100)
    .map((b) => `"${b.title}" by ${b.author}`)
    .join("\n");

  const userMessage = `Finished book:
Title: ${book.title}
Author: ${book.author}
${book.book_type ? `Type: ${book.book_type}\n` : ""}${book.category ? `Category: ${book.category}\n` : ""}${book.blurb ? `Blurb: ${book.blurb}\n` : ""}${book.note ? `Reader's note: ${book.note}\n` : ""}
Already in the reader's library (do not recommend these):
${excludeList || "(none)"}`;

  let text: string;

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    text = response.choices[0].message.content ?? "";
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type");
    text = block.text;
  }

  return parseRecommendations(text);
}
