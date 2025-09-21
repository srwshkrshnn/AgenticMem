"""Seed demo memories into Cosmos DB and Graphiti via backend API.

Usage:
  Activate virtualenv & ensure Django server running (default http://localhost:8000)
  Then run:
    python scripts/seed_demo_memories.py --host http://localhost:8000 --limit 35

The script:
  - Posts each curated memory content to /api/memories/add-with-graphiti/
  - Uses provided synthetic IDs (M-001 ...)
  - Skips duplicates idempotently (HTTP 200 with idempotent flag)
  - Reports summary table at end
"""
from __future__ import annotations
import argparse
import json
import textwrap
import time
from dataclasses import dataclass
from typing import List, Dict, Optional
import requests

DEFAULT_MEMORIES = [
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

@dataclass
class Result:
    id: str
    status_code: int
    created: bool
    skipped: bool
    error: str | None
    episode: str | None


def _safe_json(resp) -> Optional[dict]:
    try:
        if not resp.content:
            return None
        return resp.json()
    except Exception:
        snippet = resp.text[:200] if getattr(resp, 'text', None) else '<no-body>'
        return {"_raw_non_json": snippet}


def seed(memories: List[tuple], host: str, dry_run: bool = False, delay: float = 0.0, fallback_no_graphiti: bool = False, retries: int = 2) -> List[Result]:
    endpoint = host.rstrip('/') + '/api/memories/add-with-graphiti/'
    basic_endpoint = host.rstrip('/') + '/api/memories/add/'
    results: List[Result] = []
    for mid, text in memories:
        payload = {
            "id": mid,
            "content": text,
            "episode_name": f"episode-{mid.lower()}",
            "source_description": "seed_demo"
        }
        if dry_run:
            print(f"[DRY-RUN] Would POST {mid}")
            results.append(Result(mid, 0, False, True, None, None))
            continue
        attempt = 0
        final_result: Result | None = None
        while attempt <= retries and final_result is None:
            attempt += 1
            try:
                target = basic_endpoint if fallback_no_graphiti else endpoint
                resp = requests.post(target, json=payload if not fallback_no_graphiti else {"content": text}, timeout=40)
                data = _safe_json(resp) or {}
                created = resp.status_code == 201
                skipped = bool(data.get('idempotent') or (data.get('graphiti') or {}).get('skipped')) and not created
                episode = (data.get('graphiti') or {}).get('episode_name') if isinstance(data.get('graphiti'), dict) else None
                error = None
                if resp.status_code >= 400:
                    raw_non_json = data.get('_raw_non_json') if isinstance(data, dict) else None
                    error = data.get('error') or raw_non_json or f"HTTP {resp.status_code}"
                if not created and not skipped and not error and attempt <= retries:
                    # ambiguous response; retry
                    print(f"{mid}: ambiguous response, retrying ({attempt}/{retries})")
                    time.sleep(0.5)
                    continue
                final_result = Result(mid, resp.status_code, created, skipped, error, episode)
                status_txt = 'CREATED' if created else ('SKIPPED' if skipped else ('ERROR' if error else 'UNKNOWN'))
                print(f"{mid}: {status_txt} (HTTP {resp.status_code}) episode={episode or '-'}" + (f" retry={attempt}" if attempt>1 else ""))
            except Exception as e:
                if attempt <= retries:
                    print(f"{mid}: exception {e}, retrying ({attempt}/{retries})")
                    time.sleep(0.5)
                    continue
                final_result = Result(mid, 0, False, False, str(e), None)
        results.append(final_result)
        if delay:
            time.sleep(delay)
    return results


def summarize(results: List[Result]):
    created = sum(1 for r in results if r.created)
    skipped = sum(1 for r in results if r.skipped)
    errors = [r for r in results if r.error]
    print("\nSummary:")
    print(f"  Created: {created}")
    print(f"  Skipped: {skipped}")
    print(f"  Errors : {len(errors)}")
    if errors:
        print("\nErrors:")
        for e in errors:
            print(f"  {e.id}: {e.error}")


def main():
    parser = argparse.ArgumentParser(description="Seed demo memories")
    parser.add_argument('--host', default='http://localhost:8000', help='Base host for Django server')
    parser.add_argument('--limit', type=int, default=len(DEFAULT_MEMORIES), help='Limit number of memories')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--delay', type=float, default=0.0, help='Optional delay between posts (seconds)')
    parser.add_argument('--fallback-no-graphiti', action='store_true', help='Use basic /add/ endpoint (skip Graphiti ingestion).')
    parser.add_argument('--retries', type=int, default=2, help='Retries per memory on ambiguous/error responses.')
    args = parser.parse_args()

    subset = DEFAULT_MEMORIES[: args.limit]
    print(f"Seeding {len(subset)} memories to {args.host}")
    results = seed(subset, args.host, dry_run=args.dry_run, delay=args.delay, fallback_no_graphiti=args.fallback_no_graphiti, retries=args.retries)
    summarize(results)

if __name__ == '__main__':
    main()
