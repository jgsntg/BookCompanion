"""
ingest_supabase.py — Read one v0 extraction JSON and write it to Supabase.

Default usage migrates exactly one book, leaving the second extracted book
available for the production smoke test:

    python scripts/ingest_supabase.py

Override explicitly when needed:

    python scripts/ingest_supabase.py ../../v0/output/the-blade-itself.json

Required env:
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    VOYAGE_API_KEY
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import voyageai
from dotenv import load_dotenv

from dedupe import make_dedupe_key

DEFAULT_JSON_PATH = Path(__file__).parents[2] / "v0" / "output" / "kings-of-the-wyld.json"
SCHEMA = "book_companion"
EMBED_MODEL = "voyage-3-lite"


class SupabaseRest:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.rest_url = url.rstrip("/") + "/rest/v1"
        self.service_role_key = service_role_key

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
        *,
        prefer: str | None = None,
    ) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Profile": SCHEMA,
            "Content-Profile": SCHEMA,
        }
        if prefer:
            headers["Prefer"] = prefer

        req = urllib.request.Request(
            self.rest_url + path,
            data=data,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(req) as res:
                text = res.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8")
            raise RuntimeError(f"Supabase {method} {path} failed: {exc.code} {detail}") from exc


def chunks_from_extraction(extraction: dict) -> list[tuple[str, str, dict]]:
    out: list[tuple[str, str, dict]] = []

    if summary := extraction.get("summary"):
        out.append(("summary", summary, {"summary": summary}))

    for claim in extraction.get("claims") or []:
        text = claim.get("claim", "")
        if text:
            out.append(("claim", text, claim))

    for fw in extraction.get("frameworks") or []:
        name = fw.get("name", "")
        desc = fw.get("description", "")
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("framework", text, fw))

    for passage in extraction.get("memorable_passages") or []:
        quote = passage.get("quote", "")
        if quote:
            out.append(("passage", quote, passage))

    for connection in extraction.get("connections") or []:
        if connection:
            out.append(("connection", connection, {"connection": connection}))

    for question in extraction.get("questions_raised") or []:
        if question:
            out.append(("question", question, {"question": question}))

    for event in (extraction.get("key_events") or extraction.get("events") or []):
        text = event.get("event", "")
        if text:
            involved = event.get("characters_involved") or []
            if involved:
                text = f"{text} (characters: {', '.join(involved)})"
            out.append(("event", text, event))

    for character in extraction.get("characters") or []:
        name = character.get("name", "")
        desc = character.get("description", "")
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("character", text, character))

    for location in extraction.get("locations") or []:
        name = location.get("name", "")
        desc = location.get("description", "")
        text = f"{name}: {desc}".strip(": ").strip()
        if text:
            out.append(("location", text, location))

    return out


def embed_batch(client: voyageai.Client, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    result = client.embed(texts, model=EMBED_MODEL, input_type="document")
    return result.embeddings


def as_vector(values: list[float]) -> str:
    return f"[{','.join(str(v) for v in values)}]"


def load_env() -> tuple[SupabaseRest, voyageai.Client]:
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / "web" / ".env.local")

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    voyage_key = os.environ.get("VOYAGE_API_KEY")

    missing = [
        name
        for name, value in [
            ("NEXT_PUBLIC_SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", service_role_key),
            ("VOYAGE_API_KEY", voyage_key),
        ]
        if not value
    ]
    if missing:
        sys.exit(f"Missing env var(s): {', '.join(missing)}")

    return SupabaseRest(supabase_url, service_role_key), voyageai.Client(api_key=voyage_key)


def get_existing_book(client: SupabaseRest, dedupe_key: str) -> Optional[dict]:
    encoded = urllib.parse.quote(dedupe_key, safe="")
    rows = client.request(
        "GET",
        f"/books?dedupe_key=eq.{encoded}&select=id,reading_status",
    )
    return rows[0] if rows else None


def ingest(json_path: Path) -> None:
    data = json.loads(json_path.read_text())
    title = data["title"]
    author = data["author"]
    book_type = data.get("book_type")
    source = data["source_file"]
    chapters = data["chapters"]
    dedupe_key = make_dedupe_key(title, author)

    client, voyage = load_env()

    existing = get_existing_book(client, dedupe_key)
    if existing:
        reading_status = "reading" if existing["reading_status"] == "want_to_read" else existing["reading_status"]
        book = client.request(
            "PATCH",
            f"/books?id=eq.{existing['id']}",
            {
                "source_file": source,
                "chapter_count": len(chapters),
                "is_ingested": True,
                "ingest_status": "processing",
                "book_type": book_type,
                "reading_status": reading_status,
                "updated_at": utc_now(),
            },
            prefer="return=representation",
        )[0]
    else:
        book = client.request(
            "POST",
            "/books",
            {
                "title": title,
                "author": author,
                "dedupe_key": dedupe_key,
                "source_file": source,
                "chapter_count": len(chapters),
                "is_ingested": True,
                "ingest_status": "processing",
                "reading_status": "reading",
                "book_type": book_type,
            },
            prefer="return=representation",
        )[0]

    book_id = book["id"]

    # Re-ingest is idempotent. Preserve user-authored note chunks.
    client.request("DELETE", f"/chunks?book_id=eq.{book_id}&chunk_type=neq.note")
    client.request("DELETE", f"/chapters?book_id=eq.{book_id}")

    print(f"Ingesting {title} by {author} ({len(chapters)} chapters) into Supabase")

    total_chunks = 0
    for ch in chapters:
        if not ch.get("extraction"):
            print(f"  [{ch['chapter_number']:>2}] (skipped - no extraction)")
            continue

        chapter = client.request(
            "POST",
            "/chapters",
            {
                "book_id": book_id,
                "chapter_number": ch["chapter_number"],
                "title": ch.get("title"),
                "word_count": ch.get("word_count"),
                "extraction": ch["extraction"],
            },
            prefer="return=representation",
        )[0]

        chunk_tuples = chunks_from_extraction(ch["extraction"])
        if not chunk_tuples:
            print(f"  [{ch['chapter_number']:>2}] {ch.get('title', '')} - 0 chunks")
            continue

        texts = [t[1] for t in chunk_tuples]
        embeddings = embed_batch(voyage, texts)

        chunk_rows = [
            {
                "book_id": book_id,
                "chapter_id": chapter["id"],
                "chapter_number": ch["chapter_number"],
                "chunk_type": chunk_type,
                "content": content,
                "payload": payload,
            }
            for chunk_type, content, payload in chunk_tuples
        ]
        inserted_chunks = client.request(
            "POST",
            "/chunks",
            chunk_rows,
            prefer="return=representation",
        )

        vector_rows = [
            {"chunk_id": chunk["id"], "embedding": as_vector(embedding)}
            for chunk, embedding in zip(inserted_chunks, embeddings)
        ]
        client.request("POST", "/chunk_vectors", vector_rows)

        total_chunks += len(chunk_tuples)
        print(f"  [{ch['chapter_number']:>2}] {ch.get('title', '')} - {len(chunk_tuples)} chunks")

    client.request(
        "PATCH",
        f"/books?id=eq.{book_id}",
        {"ingest_status": "ready", "updated_at": utc_now()},
    )
    print(f"\nDone. {total_chunks} chunks embedded. Supabase book id: {book_id}")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    if len(sys.argv) > 2:
        sys.exit("Usage: python scripts/ingest_supabase.py [path/to/extraction.json]")

    path = Path(sys.argv[1]) if len(sys.argv) == 2 else DEFAULT_JSON_PATH
    if not path.exists():
        sys.exit(f"Extraction JSON not found: {path}")

    ingest(path)
