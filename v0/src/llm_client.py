"""
Thin provider abstraction so the rest of the code stays provider-agnostic.

Usage:
    client = LLMClient.from_env(provider="anthropic", model="claude-sonnet-4-6")
    text = client.complete(model=client.extraction_model, max_tokens=6000, messages=[...])

Supported providers: "anthropic" | "openai"
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Literal

Provider = Literal["anthropic", "openai"]

# Fallback models when no explicit model is chosen
_DEFAULT_MODELS: dict[str, dict[str, str]] = {
    "anthropic": {
        "extraction": "claude-sonnet-4-6",
        "detection": "claude-haiku-4-5-20251001",
    },
    "openai": {
        "extraction": "gpt-4o",
        "detection": "gpt-4o-mini",
    },
}


@dataclass
class LLMClient:
    provider: Provider
    _raw: Any                          # underlying SDK client
    _extraction_model: str | None = field(default=None)  # explicit override

    @classmethod
    def from_env(
        cls,
        provider: Provider | None = None,
        model: str | None = None,
    ) -> "LLMClient":
        """Build from environment. provider/model args override env vars."""
        p: Provider = provider or os.environ.get("LLM_PROVIDER", "anthropic")  # type: ignore[assignment]
        if p not in ("anthropic", "openai"):
            raise ValueError(f"Unknown provider '{p}'. Use 'anthropic' or 'openai'.")

        if p == "anthropic":
            from anthropic import Anthropic
            key = os.environ.get("ANTHROPIC_API_KEY")
            if not key:
                raise RuntimeError("ANTHROPIC_API_KEY not set (check .env)")
            return cls(provider=p, _raw=Anthropic(api_key=key), _extraction_model=model)
        else:
            from openai import OpenAI
            key = os.environ.get("OPENAI_API_KEY")
            if not key:
                raise RuntimeError("OPENAI_API_KEY not set (check .env)")
            return cls(provider=p, _raw=OpenAI(api_key=key), _extraction_model=model)

    @property
    def extraction_model(self) -> str:
        return self._extraction_model or _DEFAULT_MODELS[self.provider]["extraction"]

    @property
    def detection_model(self) -> str:
        return _DEFAULT_MODELS[self.provider]["detection"]

    def complete(self, *, model: str, max_tokens: int, messages: list[dict]) -> str:
        """Call the model and return the response text."""
        if self.provider == "anthropic":
            response = self._raw.messages.create(
                model=model,
                max_tokens=max_tokens,
                messages=messages,
            )
            return response.content[0].text
        else:
            response = self._raw.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=messages,
            )
            return response.choices[0].message.content or ""
