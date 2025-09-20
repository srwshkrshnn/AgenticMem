"""List recent Graphiti episodes.

Simple utility that queries Neo4j directly for `Episodic` nodes ordered by `created_at` desc.
Relies on the same environment variables used by `graphiti_client`.

Usage:
  python scripts/list_recent_episodes.py --limit 5
  python scripts/list_recent_episodes.py --limit 10 --json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime
from typing import Any

from dotenv import load_dotenv

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from memories.graphiti_client import get_graphiti  # type: ignore


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="List recent Graphiti episodes")
    p.add_argument("--limit", type=int, default=5, help="Number of episodes to list")
    p.add_argument("--json", action="store_true", help="Output JSON instead of table")
    return p.parse_args()


def load_env():
    if os.path.exists(".env"):
        load_dotenv(".env")


async def fetch(limit: int) -> list[dict[str, Any]]:
    g = await get_graphiti()
    # Attempt to pull the most common episodic properties.
    cypher = (
        "MATCH (e:Episodic) "
        "RETURN e.uuid AS uuid, e.name AS name, e.source AS source, e.source_description AS source_description, "
        "e.created_at AS created_at, e.content AS content "
        "ORDER BY coalesce(e.created_at, datetime({epochmillis:0})) DESC "
        "LIMIT $limit"
    )
    records, _, _ = await g.driver.execute_query(cypher, limit=limit)
    result = []
    for r in records:
        result.append({k: r.get(k) for k in ["uuid", "name", "source", "source_description", "created_at", "content"]})
    return result


def format_table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "(no episodes)"
    # Simple column width calculation
    cols = ["uuid", "name", "source", "source_description", "created_at"]
    widths = {c: max(len(c), *(len(str(r.get(c) or "")) for r in rows)) for c in cols}
    line = " | ".join(c.ljust(widths[c]) for c in cols)
    sep = "-+-".join("-" * widths[c] for c in cols)
    out = [line, sep]
    for r in rows:
        out.append(" | ".join(str(r.get(c) or "").ljust(widths[c]) for c in cols))
    return "\n".join(out)


def main():
    args = parse_args()
    load_env()
    rows = asyncio.run(fetch(args.limit))
    if args.json:
        print(json.dumps(rows, default=str, indent=2))
    else:
        print(format_table(rows))
        if rows and len(rows) < args.limit:
            print(f"\nOnly {len(rows)} episodes found.")


if __name__ == "__main__":  # pragma: no cover
    main()
