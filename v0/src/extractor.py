"""
Calls the configured LLM with the chapter extraction prompt and returns parsed JSON.

The prompt is composed from base + type-specific fragments in prompts/.
Kept deliberately thin — the prompts are the product, not this code.
"""

from __future__ import annotations

import json
from pathlib import Path

from llm_client import LLMClient

MAX_TOKENS = 6000

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class ExtractionError(Exception):
    pass


def _load(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text()


def build_prompt(
    *,
    book_type: str,
    title: str,
    author: str,
    chapter_number: int,
    chapter_title: str,
    chapter_text: str,
) -> str:
    base = _load("_base.md")
    shared_fields = _load("_shared_fields.txt")
    additional_fields = _load(f"_{book_type}_fields.txt")
    additional_rules = _load(f"_{book_type}_rules.txt")

    return (
        base
        .replace("{shared_fields}", shared_fields)
        .replace("{additional_fields}", additional_fields)
        .replace("{additional_rules}", additional_rules)
        .replace("{book_type}", book_type)
        .replace("{title}", title)
        .replace("{author}", author)
        .replace("{chapter_number}", str(chapter_number))
        .replace("{chapter_title}", chapter_title)
        .replace("{chapter_text}", chapter_text)
    )


def extract_chapter(
    client: LLMClient,
    *,
    book_type: str,
    title: str,
    author: str,
    chapter_number: int,
    chapter_title: str,
    chapter_text: str,
) -> dict:
    """Run the extraction prompt against one chapter; return parsed JSON dict."""
    prompt = build_prompt(
        book_type=book_type,
        title=title,
        author=author,
        chapter_number=chapter_number,
        chapter_title=chapter_title,
        chapter_text=chapter_text,
    )

    raw = client.complete(
        model=client.extraction_model,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    ).strip()

    # Strip markdown fences defensively.
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
