"""Utility script to insert a single Graphiti episode.

Loads environment variables from .env, initializes the Azure-backed Graphiti instance
(via memories.graphiti_client.get_graphiti), and creates an episode with the provided
text content. Mirrors usage patterns in memories.views.

Usage (PowerShell):
  python scripts/insert_episode.py --body "Some memory text" --name my-episode

Arguments:
  --body / -b   Episode textual content (required)
  --name / -n   Optional explicit episode name (default: auto timestamp)
  --source-desc Optional source description label (default: cli_insert)

Environment Requirements (see README_GRAPHITI_AZURE.md):
  AZURE_OPENAI_KEY, AZURE_OPENAI_VERSION, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT
Optional:
  AZURE_OPENAI_SMALL_DEPLOYMENT, AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  AZURE_OPENAI_LLM_ENDPOINT, AZURE_OPENAI_EMBEDDING_ENDPOINT

Exit Codes:
  0 success
  1 argument / validation error
  2 operational failure (Graphiti / network / Azure)
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from pathlib import Path

# Ensure project root (parent of scripts/) is on sys.path before importing local packages
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Reuse existing initialization logic (imports after path fix)
from memories.graphiti_client import get_graphiti  # type: ignore  # noqa: E402
from graphiti_core.nodes import EpisodeType  # type: ignore  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Insert Graphiti episodes (single or sample batch)")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--body", "-b", help="Episode body text")
    group.add_argument(
        "--sample-story",
        action="store_true",
        help="Insert 10 interconnected sample knowledge graph episodes (generic domain)",
    )
    parser.add_argument("--name", "-n", help="Optional episode name (single insert mode)")
    parser.add_argument("--source-desc", default="cli_insert", help="Source description label (single insert)")
    return parser.parse_args()


def load_env():
    # Load .env if present; don't fail if absent.
    if os.path.exists(".env"):
        load_dotenv(".env")
    # Minimal validation for required Azure vars (others validated in graphiti_client)
    required = [
        "AZURE_OPENAI_KEY",
        "AZURE_OPENAI_VERSION",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise SystemExit(
            f"Missing required environment variables: {', '.join(missing)}. See README_GRAPHITI_AZURE.md"
        )


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def insert_episode(body: str, name: str | None, source_desc: str):
    graphiti = await get_graphiti()
    ep_name = name or f"memory-{iso_now()}"
    resp = await graphiti.add_episode(
        name=ep_name,
        episode_body=body,
        source=EpisodeType.text,
        source_description=source_desc,
        reference_time=datetime.utcnow(),
    )
    return ep_name, resp


def _sample_episodes() -> list[tuple[str, str]]:
    """Return 10 interconnected sample episodes.

    Entities (intentionally reused to create dense connectivity):
      - People: Alice, Bob, Eve, Mallory, Dr. Singh
      - Orgs / Places: Zephyr Labs, Ramgarh Data Center, Orion Observatory
      - Tech/Concepts: Quantum Core, Neural Mesh, Protocol Orion, Sentinel Drone Network
      - Artifacts: Edge Node-7, Knowledge Atlas, Archive Shard-α

    Each episode body cross-references multiple prior entities to promote rich graph linkage.
    Names are slug-style for deterministic IDs.
    """

    episodes: list[tuple[str, str]] = [
        (
            "bootstrap-quantum-core",
            "Alice documents the initial bootstrap of the Quantum Core inside Zephyr Labs, noting that Edge Node-7 still runs legacy firmware and that Dr. Singh approved the provisional Neural Mesh topology.",
        ),
        (
            "bob-validates-mesh",
            "Bob reviews Alice's bootstrap notes on the Quantum Core and validates the emerging Neural Mesh overlay; he flags that Protocol Orion telemetry from Edge Node-7 conflicts with metrics stored in the Knowledge Atlas.",
        ),
        (
            "eve-discovers-telemetry-gap",
            "Eve correlates Protocol Orion logs with Zephyr Labs internal dashboards and finds a silent drop in Sentinel Drone Network pings between Edge Node-7 and the Ramgarh Data Center during Alice's bootstrap window.",
        ),
        (
            "mallory-injects-anomaly",
            "Mallory (red-team) injects a synthetic anomaly into the Neural Mesh causing the Quantum Core to quarantine Archive Shard-α; Bob and Eve receive automated alerts referencing Alice's original bootstrap episode.",
        ),
        (
            "dr-singh-issues-advisory",
            "Dr. Singh issues an advisory linking Mallory's anomaly test to a required firmware uplift for Edge Node-7 and two Sentinel Drone Network relays near the Orion Observatory integration path.",
        ),
        (
            "alice-and-bob-fix-node7",
            "Alice and Bob jointly patch Edge Node-7, updating Protocol Orion handlers; the change log cites Eve's telemetry gap report and Dr. Singh's advisory, then syncs new schema hashes to the Knowledge Atlas.",
        ),
        (
            "eve-confirms-stability",
            "Eve reruns correlation across Neural Mesh channels: Quantum Core load normalizes, Sentinel Drone Network latency drops 12%, and Archive Shard-α exits quarantine; she tags Mallory to review residual risk.",
        ),
        (
            "mallory-penetration-retrospective",
            "Mallory publishes a retrospective mapping how the injected anomaly traversed pre-patch Protocol Orion surfaces, praising Alice's early documentation and Bob's validation steps for accelerating containment.",
        ),
        (
            "knowledge-atlas-refactor",
            "Bob refactors Knowledge Atlas ingestion to prioritize Neural Mesh provenance edges, incorporating Eve's stability metrics and embedding Dr. Singh's advisory as a persistent governance node.",
        ),
        (
            "orion-observatory-linkup",
            "Alice, Eve, and Dr. Singh oversee the Orion Observatory link-up: Protocol Orion handshake succeeds on first attempt; Edge Node-7 streams calibrated sensor frames; Sentinel Drone Network schedules autonomous patrol syncs.",
        ),
    ]
    return episodes


async def insert_sample_story():
    episodes = _sample_episodes()
    successes: list[str] = []
    failures: list[tuple[str, str]] = []
    for name, body in episodes:
        try:
            ep_name, _ = await insert_episode(body=body, name=name, source_desc="sample_story")
            print(f"[insert_episode] STORY OK: {ep_name}")
            successes.append(ep_name)
        except Exception as e:  # noqa: BLE001
            print(f"[insert_episode] STORY FAIL {name}: {e}")
            failures.append((name, str(e)))
    return successes, failures


def main():
    args = parse_args()
    try:
        load_env()
    except SystemExit as e:
        print(f"[insert_episode] ENV ERROR: {e}")
        sys.exit(1)

    if getattr(args, "sample_story", False):
        try:
            successes, failures = asyncio.run(insert_sample_story())
            print(f"[insert_episode] STORY SUMMARY: {len(successes)} succeeded, {len(failures)} failed")
            if failures:
                for n, err in failures:
                    print(f" - {n}: {err}")
            sys.exit(0 if not failures else 2)
        except Exception as e:  # noqa: BLE001
            print(f"[insert_episode] STORY FATAL: {e}")
            sys.exit(2)
    else:
        if not args.body:
            print("[insert_episode] ERROR: --body required in single insert mode")
            sys.exit(1)
        try:
            ep_name, _ = asyncio.run(insert_episode(args.body, args.name, args.source_desc))
            print(f"[insert_episode] SUCCESS: episode '{ep_name}' inserted")
            sys.exit(0)
        except Exception as e:  # noqa: BLE001
            print(f"[insert_episode] FAILURE: {e}")
            sys.exit(2)


if __name__ == "__main__":  # pragma: no cover
    main()
