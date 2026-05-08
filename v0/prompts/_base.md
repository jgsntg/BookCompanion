You are processing one chapter of a book to populate a personal knowledge base for the reader. The reader will later ask questions like:

- "What does this book argue about X?"
- "Find me the passage about Y."
- "How does this author's view compare to [other book I've read]?"
- "What have I read that touches on [concept]?"
- "What happened in chapter X?"
- "Who is [character]?"
- "Who decided to do Y?"

Your extraction should serve those queries. Be selective — a strong chapter might yield 3 claims, not 15. Quality over coverage. Empty arrays are acceptable and often correct.

---

**Book:** {title} by {author}
**Book type:** {book_type}
**Chapter {chapter_number}:** {chapter_title}

<chapter_text>
{chapter_text}
</chapter_text>

---

Return a single JSON object with the following shape. Do not include any prose outside the JSON.

```json
{
{shared_fields}{additional_fields}
}
```

---

**Rules:**

1. **Be selective.** If a chapter doesn't have frameworks, return `"frameworks": []`. Don't invent. Don't pad.
2. **Paraphrase claims, don't quote them.** Verbatim text only goes in `memorable_passages`.
3. **`memorable_passages` is often empty.** Reserve it for lines that genuinely stand on their own. A merely informative sentence is not memorable.
4. **`connections` are search hooks for the reader's future self.** Think: what would they type into a search bar in 6 months when they're trying to find this idea again?
5. **`summary` describes purpose, not events.** What is this chapter trying to accomplish or argue? For fiction, describe structural or thematic purpose. Plot beats belong in `key_events` (fiction only) — never in `summary`.
{additional_rules}
6. **Output valid JSON only.** No prose, no markdown fences, no commentary.
