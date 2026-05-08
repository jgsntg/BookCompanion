"""
Detect whether a book is fiction or nonfiction.

Uses a fast Claude call on the title, author, and a text sample.
Falls back to 'nonfiction' on any error (safer default for extraction quality).
"""

from __future__ import annotations

from anthropic import Anthropic

MODEL = "claude-haiku-4-5-20251001"
SAMPLE_WORDS = 300

_PROMPT = """\
Given the title, author, and opening text of a book, classify it as either fiction or nonfiction.

Title: {title}
Author: {author}

Opening text:
<sample>
{sample}
</sample>

Respond with exactly one word: fiction or nonfiction. Nothing else."""


def detect_book_type(client: Anthropic, title: str, author: str, sample_text: str) -> str:
    """Return 'fiction' or 'nonfiction'. Falls back to 'nonfiction' on any error."""
    sample = " ".join(sample_text.split()[:SAMPLE_WORDS])
    prompt = (
        _PROMPT
        .replace("{title}", title)
        .replace("{author}", author)
        .replace("{sample}", sample)
    )
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        result = response.content[0].text.strip().lower()
        if result in ("fiction", "nonfiction"):
            return result
        if "nonfiction" in result or "non-fiction" in result:
            return "nonfiction"
        if "fiction" in result:
            return "fiction"
        return "nonfiction"
    except Exception:
        return "nonfiction"
