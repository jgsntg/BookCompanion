"""
Calls Claude with the chapter extraction prompt and returns parsed JSON.

The prompt is composed at runtime from:
  - prompts/_base.md             (shared role, rules, output format)
  - prompts/_shared_fields.txt   (JSON fields present for both types:
                                   summary, claims, frameworks,
                                   memorable_passages, connections,
                                   questions_raised)
  - prompts/_<type>_fields.txt   (type-specific JSON fields:
                                   fiction adds key_events, characters,
                                   locations; non-fiction is empty)
  - prompts/_<type>_rules.txt    (type-specific extra rules)

Both types share the same shared fields. Fiction extends with extra
fields. This matches the user's tuned prompt: claims/frameworks exist
for fiction too (they capture thematic arguments) but key_events,
characters, locations are fiction-only.
"""

from __future__ import annotations

import json
from pathlib import Path

from anthropic import Anthropic

MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 6000

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class ExtractionError(Exception):
    pass


def _compose_prompt(book_type: str) -> str:
    """Read base + fragments and assemble the full prompt template."""
    if book_type not in ("fiction", "nonfiction"):
        raise ValueError(f"Unknown book_type: {book_type}")

    base = (PROMPTS_DIR / "_base.md").read_text()
    shared_fields = (PROMPTS_DIR / "_shared_fields.txt").read_text().strip()
    type_fields = (PROMPTS_DIR / f"_{book_type}_fields.txt").read_text().strip()
    type_rules = (PROMPTS_DIR / f"_{book_type}_rules.txt").read_text().strip()

    # Build the full JSON schema block.
    # Shared fields always included; type-specific fields appended
    # if non-empty.
    if type_fields:
        json_inner = (
            shared_fields.replace("\n", "\n  ")
            + ",\n\n  "
            + type_fields.replace("\n", "\n  ")
        )
    else:
        json_inner = shared_fields.replace("\n", "\n  ")

    json_block = "{\n  " + json_inner + "\n}"

    return (
        base
        .replace("{type_specific_fields}", json_block)
        .replace("{type_specific_rules}", "\n" + type_rules if type_rules else "")
    )


def extract_chapter(
    client: Anthropic,
    *,
    title: str,
    author: str,
    book_type: str,
    chapter_number: int,
    chapter_title: str,
    chapter_text: str,
) -> dict:
    """Run the extraction prompt against one chapter; return parsed JSON dict."""
    template = _compose_prompt(book_type)
    prompt = (
        template
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
