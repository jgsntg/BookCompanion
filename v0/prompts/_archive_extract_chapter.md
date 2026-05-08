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
**Chapter {chapter_number}:** {chapter_title}

<chapter_text>
{chapter_text}
</chapter_text>

---

Return a single JSON object with the following shape. Do not include any prose outside the JSON.

```json
{
  "summary": "2-3 sentences. Not a recap of what happens — a description of what this chapter is trying to accomplish or argue. For fiction, what does this chapter do for the larger arc, thematically or structurally?",

  "claims": [
    {
      "claim": "A specific assertion the author makes, paraphrased in their voice. Should be debatable — if everyone would agree, it's not worth extracting. For fiction, this might be a thematic argument the chapter advances, not a plot point.",
      "evidence": "How the author supports it: study, anecdote, logic, authority, narrative demonstration. One sentence.",
      "confidence": "stated | implied | speculative"
    }
  ],

  "frameworks": [
    {
      "name": "Name of the model, framework, or distinction (e.g., 'Type 1 vs Type 2 decisions', 'the four quadrants of X').",
      "description": "What it is and when it applies. One or two sentences.",
      "components": ["element 1", "element 2", "..."]
    }
  ],

  "memorable_passages": [
    {
      "quote": "Verbatim quote, only if genuinely memorable or quotable on its own. Most chapters yield zero of these — that's normal.",
      "context": "What's happening or being argued when this is said."
    }
  ],

  "connections": [
    "Concepts, fields, or ideas this chapter touches that the reader might want to connect to other books later. Single phrases, not sentences. Examples: 'compound interest', 'principal-agent problems', 'flow state', 'survivorship bias'."
  ],

  "questions_raised": [
    "Open questions the chapter implies but doesn't fully answer. These often become great cross-book synthesis prompts later. One question per array entry."
  ],

  "key_events": [
    {
      "event": "What happened, in one sentence. Focus on actions, decisions, arrivals, deaths, reveals, and turning points — things that change the state of the story.",
      "characters_involved": ["Name of each character who drives or is directly affected by this event."]
    }
  ],

  "characters": [
    {
      "name": "Character name",
      "description": "Who they are and their role. Include faction, relationship to protagonist, and key traits if established. 1-2 sentences.",
      "first_appearance": true
    }
  ],

  "locations": [
    {
      "name": "Location name",
      "description": "What kind of place it is and why it matters here. 1 sentence."
    }
  ]
}
```

---

**Rules:**

1. **Be selective.** If a chapter doesn't have frameworks, return `"frameworks": []`. Don't invent. Don't pad.
2. **Paraphrase claims, don't quote them.** Verbatim text only goes in `memorable_passages`.
3. **`memorable_passages` is often empty.** Reserve it for lines that genuinely stand on their own. A merely informative sentence is not memorable.
4. **`connections` are search hooks for the reader's future self.** Think: what would they type into a search bar in 6 months when they're trying to find this idea again?
5. **For non-fiction**, focus on claims, frameworks, and connections. Memorable passages are rare.
6. **For fiction**, claims become thematic arguments; frameworks are rare; memorable passages are more common; connections still apply (themes, motifs, ideas the work engages with).
7. **For non-fiction**, do not summarize plot — there is none. Focus on claims, frameworks, and connections.
8. **For fiction**, `key_events`, `characters`, and `locations` are required fields. Capture the 2-5 most plot-significant events per chapter — turning points, decisions, arrivals, deaths, reveals. Skip minor background action. If nothing significant happens, return `[]`.
9. **`characters`**: list every named character who speaks, acts, or is meaningfully described in this chapter. Set `first_appearance: true` only if this is the first time they appear in the book. Be brief — one or two sentences per character. Do not list characters who are merely mentioned in passing.
10. **`locations`**: list named places that appear or are referenced in ways that matter to the plot (where characters are, where they're going, where something happened). Skip vague or incidental references.
11. **Output valid JSON only.** No prose, no markdown fences, no commentary.
