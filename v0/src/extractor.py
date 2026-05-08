"""
Calls Claude with the chapter extraction prompt and returns parsed JSON.

Kept deliberately thin — the prompt is the product, not this code.
"""

from __future__ import annotations

import json
from pathlib import Path

from anthropic import Anthropic

MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 4096

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extract_chapter.md"


class ExtractionError(Exception):
    pass


def extract_chapter(
    client: Anthropic,
    *,
    title: str,
    author: str,
    chapter_number: int,
    chapter_title: str,
    chapter_text: str,
) -> dict:
    """Run the extraction prompt against one chapter; return parsed JSON dict."""
    prompt_template = PROMPT_PATH.read_text()
    prompt = (
        prompt_template
        .replace("{title}", title)
        .replace("{author}", author)
        .replace("{chapter_number}", str(chapter_number))
        .replace("{chapter_title}", chapter_title)
        .replace("{chapter_text}", chapter_text)
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    # Sonnet usually returns clean JSON; strip fences defensively.
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ExtractionError(
            f"Chapter {chapter_number} returned invalid JSON: {e}\n\n"
            f"First 500 chars of response:\n{raw[:500]}"
        ) from e
