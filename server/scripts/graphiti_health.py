"""Graphiti health & readiness check.

Performs:
 1. Neo4j connectivity & minimal write/read (temp node)
 2. LLM structured completion smoke test (tiny prompt)
 3. Embedding generation smoke test (if embedder configured)
 4. Reports timing + any warnings

Exit codes:
 0 healthy
 1 degraded (non-fatal failures)
 2 fatal (cannot reach core dependencies)
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from typing import Any

from dotenv import load_dotenv

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from memories.graphiti_client import get_graphiti  # type: ignore
from graphiti_core.nodes import EpisodeType  # type: ignore
from graphiti_core.llm_client.config import LLMConfig  # type: ignore


async def check_neo4j(g) -> tuple[bool, str]:
    try:
        await g.driver.execute_query("CREATE (h:HealthCheck {ts: timestamp()}) RETURN h LIMIT 1")
        await g.driver.execute_query("MATCH (h:HealthCheck) DELETE h")
        return True, "neo4j ok"
    except Exception as e:  # noqa: BLE001
        return False, f"neo4j error: {e}"  # fatal


async def check_llm(g) -> tuple[bool, str]:
    try:
        # Use internal low-level to ensure call path works; here we just add a trivial episode (dry) using add_episode logic shortened.
        # Instead, we send a minimal prompt through the llm_client directly if available.
        client = getattr(g, "llm_client", None)
        if not client:
            return False, "llm missing"
        messages = [
            type("Msg", (), {"role": "system", "content": "You output a JSON object with a single key 'ok'."})(),
            type("Msg", (), {"role": "user", "content": "Say ok:true"})(),
        ]
        # Reuse generate_response if present
        if hasattr(client, "generate_response"):
            resp = await client.generate_response(messages)  # type: ignore
            if not isinstance(resp, dict):
                return False, "llm unexpected response"
            return True, "llm ok"
        return False, "llm client lacks generate_response"
    except Exception as e:  # noqa: BLE001
        return False, f"llm error: {e}"  # degraded


async def check_embedding(g) -> tuple[bool, str]:
    try:
        emb = getattr(g, "embedder", None)
        if not emb:
            return True, "embedding not configured (skipped)"
        if hasattr(emb, "embed"):
            vec = await emb.embed(["ping"])
            if not vec or not vec[0] or not isinstance(vec[0], list):
                return False, "embedding unexpected shape"
            return True, "embedding ok"
        return False, "embedding client lacks embed()"
    except Exception as e:  # noqa: BLE001
        return False, f"embedding error: {e}"  # degraded


async def run_checks():
    g = await get_graphiti()
    results: list[tuple[str, bool, str]] = []

    neo4j_ok, neo4j_msg = await check_neo4j(g)
    results.append(("neo4j", neo4j_ok, neo4j_msg))

    llm_ok, llm_msg = await check_llm(g)
    results.append(("llm", llm_ok, llm_msg))

    emb_ok, emb_msg = await check_embedding(g)
    results.append(("embedding", emb_ok, emb_msg))

    fatal = not neo4j_ok
    degraded = (not llm_ok) or (not emb_ok)

    status = "healthy"
    code = 0
    if fatal:
        status = "fatal"
        code = 2
    elif degraded:
        status = "degraded"
        code = 1

    return status, code, results


def main():
    if os.path.exists(".env"):
        load_dotenv(".env")
    started = time.time()
    try:
        status, code, results = asyncio.run(run_checks())
    except Exception as e:  # noqa: BLE001
        print(f"graphiti_health: fatal initialization error: {e}")
        sys.exit(2)

    duration = (time.time() - started) * 1000.0
    print(f"status={status} duration_ms={duration:.1f}")
    for name, ok, msg in results:
        print(f" - {name}: {'OK' if ok else 'FAIL'} :: {msg}")
    sys.exit(code)


if __name__ == "__main__":  # pragma: no cover
    main()
