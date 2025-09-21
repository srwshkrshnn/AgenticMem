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
    group.add_argument(
        "--gsi-memories",
        action="store_true",
        help="Insert 35 Global Secondary Index implementation episodes (matches Cosmos seed set)",
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


def _gsi_memories() -> list[tuple[str, str]]:
    """Return 35 GSI implementation episodes (names slugified from IDs).

    Mirrors DEFAULT_MEMORIES in seed_demo_memories.py for Graphiti backfill.
    Episode names are lower kebab versions of the synthetic IDs and short titles.
    """
    data = [
        ("M-001", "Global Secondary Index (GSI) initiative kicked off; goal: sub-50ms fan-out queries across user memories."),
        ("M-002", "Ritika drafted initial Cosmos DB indexing policy for GSI container (include /project, /owner, /facet/*)."),
        ("M-003", "Achint proposed dedicated 'gsi_memories' container fed by change feed from primary container."),
        ("M-004", "Decision: Use synthetic composite key (userId|dayBucket) for GSI partition to balance RU + hotspot risk."),
        ("M-005", "Siddhant building change feed processor to project subset of fields into GSI container."),
        ("M-006", "Sarwesh outlined backfill strategy: parallelized range of created_at with max 10K docs per batch."),
        ("M-007", "Ritika added composite indexes: [/project, /created_at], [/owner, /status] to cut RU for multi-filter queries."),
        ("M-008", "Achint validated RU estimate: ~4 RU per projection write; target <5 RU to stay in budget."),
        ("M-009", "Performance test (Siddhant): GSI query latency p95 42ms for project+status filter after warm cache."),
        ("M-010", "Sarwesh added retry + poison queue for failed projection writes (dead-letter after 5 attempts)."),
        ("M-011", "Decision: No full-text in GSI; semantic vector search stays in primary; GSI handles structured filters."),
        ("M-012", "Achint implemented idempotency check using etag + content hash to avoid duplicate GSI upserts."),
        ("M-013", "Ritika confirmed indexing policy excludes large /embedding path to reduce storage cost ~40%."),
        ("M-014", "Siddhant added metrics: custom Azure Monitor dimensions (gsi_projection_latency_ms, gsi_ru_charge)."),
        ("M-015", "Sarwesh created rollout plan: backfill -> shadow writes -> dual read compare -> cutover -> remove shadow."),
        ("M-016", "Achint scripted progressive backfill throttle: start 200 RU/sec, ramp to 800 RU/sec if <70% consumption."),
        ("M-017", "Ritika documented consistency model: eventual between primary + GSI; read path warns if delta > 5 min."),
        ("M-018", "Siddhant built validation job sampling 1K docs comparing primary vs GSI projected fields hourly."),
        ("M-019", "Sarwesh added alert: mismatch rate >1% over 3 consecutive runs triggers pager."),
        ("M-020", "Decision: Use TTL on soft-deleted projections (ttl=86400) to allow delayed purge analytics."),
        ("M-021", "Achint implemented purge listener: hard delete event immediately removes GSI document."),
        ("M-022", "Ritika added synthetic field 'facetCount' to GSI to accelerate recommended queries (sort by richness)."),
        ("M-023", "Siddhant measured RU after composite indexes: query charge dropped from 18 RU to 6 RU average."),
        ("M-024", "Sarwesh introduced circuit breaker: if GSI write latency >500ms median for 1 min, projections pause."),
        ("M-025", "Achint added structured projection schema: {id, userId, project, status, created_at, facets, facetCount}."),
        ("M-026", "Ritika reviewed security: projection excludes PII facets (emails, phone) per data classification doc."),
        ("M-027", "Siddhant created backfill resume marker stored in state container to allow safe restart after interruption."),
        ("M-028", "Sarwesh dashboard widget now visualizes GSI coverage % = projected_docs / primary_docs."),
        ("M-029", "Load test: 500 concurrent filtered queries sustained <60ms p95; CPU at 55% on provisioned throughput."),
        ("M-030", "Decision: Keep analytical aggregates (counts per project) out of GSI; will materialize separately later."),
        ("M-031", "Achint added optional hint param 'useGSI=true' enabling A/B comparison path in API."),
        ("M-032", "Ritika optimized indexing policy removing unused path /debug/* reducing index storage by 8%."),
        ("M-033", "Siddhant integrated change feed lease container autoscaling logic."),
        ("M-034", "Sarwesh scheduled final cutover rehearsal date set for Sept 25."),
        ("M-035", "Open question: expose projection freshness timestamp in client responses?"),
    ]
    def slug(id_, text):
        base = text.split(':')[0].split('(')[0][:60]
        base = base.lower().replace(' ', '-').replace("'", '').replace('/', '-')
        base = ''.join(ch for ch in base if ch.isalnum() or ch in '-_')
        return f"gsi-{id_.lower()}-{base.strip('-')}"
    return [(slug(i, t), t) for i, t in data]


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


async def insert_gsi_memories():
    episodes = _gsi_memories()
    successes: list[str] = []
    failures: list[tuple[str, str]] = []
    for name, body in episodes:
        try:
            ep_name, _ = await insert_episode(body=body, name=name, source_desc="gsi_seed")
            print(f"[insert_episode] GSI OK: {ep_name}")
            successes.append(ep_name)
        except Exception as e:  # noqa: BLE001
            print(f"[insert_episode] GSI FAIL {name}: {e}")
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
    elif getattr(args, "gsi_memories", False):
        try:
            successes, failures = asyncio.run(insert_gsi_memories())
            print(f"[insert_episode] GSI SUMMARY: {len(successes)} succeeded, {len(failures)} failed")
            if failures:
                for n, err in failures:
                    print(f" - {n}: {err}")
            sys.exit(0 if not failures else 2)
        except Exception as e:  # noqa: BLE001
            print(f"[insert_episode] GSI FATAL: {e}")
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
