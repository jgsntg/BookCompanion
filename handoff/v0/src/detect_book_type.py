"""
Detect whether a book is fiction or non-fiction by looking at a sample
of its opening text. Used by extract.py when --type is not provided.
"""

from __future__ import annotations

import json

from anthropic import Anthropic

DETECTOR_MODEL = "claude-sonnet-4-5"
SAMPLE_WORDS = 2000

DETECTOR_PROMPT = """You will be shown the opening of a book. Decide whether it is fiction or non-fiction.

- "fiction": novels, novellas, short story collections, narrative works whose primary mode is storytelling — even if based on real events.
- "nonfiction": works whose primary mode is argument, instruction, or exposition — including memoir, biography, history, essay, business, science, self-help.

Edge guidance:
- Memoir → nonfiction (it argues from experience).
- Narrative non-fiction (e.g., a journalist's account of a real event) → nonfiction.
- Historical fiction → fiction (the primary mode is storytelling).
- A book of essays → nonfiction.

<book_opening>
{sample}
</book_opening>

Return a single JSON object, no prose, no markdown fences:
{{
  "book_type": "fiction" | "nonfiction",
  "confidence": "high" | "medium" | "low",
  "reasoning": "One short sentence."
}}"""


def detect_book_type(client: Anthropic, *, full_text: str) -> dict:
    words = full_text.split()
    sample = " ".join(words[:SAMPLE_WORDS])

    response = client.messages.create(
        model=DETECTOR_MODEL,
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": DETECTOR_PROMPT.format(sample=sample),
        }],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

    result = json.loads(raw)
    if result["book_type"] not in ("fiction", "nonfiction"):
        raise ValueError(f"Detector returned invalid book_type: {result}")
    return result
