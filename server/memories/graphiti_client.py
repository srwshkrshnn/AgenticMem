import os
import asyncio
from typing import Optional

from graphiti_core import Graphiti
from graphiti_core.llm_client.azure_openai_client import AzureOpenAILLMClient
from graphiti_core.llm_client.config import LLMConfig
from openai import AsyncAzureOpenAI
from openai import NotFoundError

# Lazy-initialized singleton Graphiti instance
_graphiti: Optional[Graphiti] = None
_lock = asyncio.Lock()

# Environment variable names expected:
#   AZURE_OPENAI_ENDPOINT (required for Azure-only mode)
#   AZURE_OPENAI_KEY (required)
#   AZURE_OPENAI_DEPLOYMENT main deployment name
#   AZURE_OPENAI_SMALL_DEPLOYMENT optional smaller/cheaper deployment name
#   NEO4J_URI (bolt://host:7687) default bolt://localhost:7687
#   NEO4J_USER default neo4j
#   NEO4J_PASSWORD default password
#   GRAPHITI_TELEMETRY_ENABLED ("false" to disable telemetry)
#   SEMAPHORE_LIMIT concurrency tuning

async def get_graphiti() -> Graphiti:
    global _graphiti
    if _graphiti is not None:
        return _graphiti
    async with _lock:
        if _graphiti is not None:
            return _graphiti
        azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        azure_api_key = os.environ.get("AZURE_OPENAI_KEY")
        if not azure_endpoint or not azure_api_key:
            raise RuntimeError("Azure-only mode: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY must be set")
        azure_version = os.environ.get("AZURE_OPENAI_VERSION")
        if not azure_version:
            raise RuntimeError("AZURE_OPENAI_VERSION must be set for Azure OpenAI usage")

        # Auto-upgrade heuristic for newer model families if an outdated version is provided.
        upgraded_version = None
        if ("4o" in (os.environ.get("AZURE_OPENAI_DEPLOYMENT") or "")) and azure_version < "2024-02-01":
            # Azure 4o family generally requires 2024-era versions. We choose a commonly available GA/preview.
            upgraded_version = "2024-06-01"
            print(f"[graphiti_client] INFO: Overriding outdated AZURE_OPENAI_VERSION '{azure_version}' with '{upgraded_version}' for 4o deployment")
            azure_version = upgraded_version
            os.environ["AZURE_OPENAI_VERSION"] = azure_version

        # Deployment names are treated as model identifiers through the OpenAI-compatible interface
        model_name = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
        if not model_name:
            raise RuntimeError("AZURE_OPENAI_DEPLOYMENT must be set for Graphiti Azure integration")
        small_model_name = os.environ.get("AZURE_OPENAI_SMALL_DEPLOYMENT", model_name)

        embed_deployment = os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
        if embed_deployment and embed_deployment.startswith("text-embedding-ada-002"):
            print("[graphiti_client] WARNING: 'text-embedding-ada-002' is legacy; consider deploying 'text-embedding-3-small' or 'text-embedding-3-large' and updating AZURE_OPENAI_EMBEDDING_DEPLOYMENT.")

        # Provide an AzureOpenAI client to the generic wrapper so it hits the correct Azure paths
        # NOTE: The generic wrapper will call chat.completions.create(model=<deployment_name>, ...)
        # which is compatible with AzureOpenAI client.
        azure_client = AsyncAzureOpenAI(
            api_key=azure_api_key,
            api_version=azure_version,
            azure_endpoint=azure_endpoint.rstrip('/'),
        )
        # Basic debug to aid diagnosing 404 (deployment not found) issues
        try:
            print(f"[graphiti_client] Azure OpenAI endpoint={azure_endpoint.rstrip('/')} deployment={model_name} version={azure_version}")
        except Exception:
            pass

        # ------------------------------------------------------------------
        # Preflight: validate deployment exists & api-version supports model.
        # This provides an early, clear error instead of opaque retries later.
        # ------------------------------------------------------------------
        try:
            # Heuristic warning for obviously outdated API version with modern models
            if ("4o" in model_name or "o1" in model_name or "o3" in model_name) and azure_version.startswith("2023-"):
                print("[graphiti_client] WARNING: API version appears old for a modern model; consider upgrading AZURE_OPENAI_VERSION (e.g. 2024-06-01).")
            preflight_resp = await azure_client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": "ping"},
                    {"role": "user", "content": "ping"},
                ],
                max_tokens=1,
                temperature=0,
            )
            if not preflight_resp or not getattr(preflight_resp, 'choices', None):
                print("[graphiti_client] WARNING: Preflight chat completion returned no choices; continuing anyway.")
            else:
                print("[graphiti_client] Preflight Azure OpenAI check succeeded.")
        except NotFoundError as nf:
            raise RuntimeError(
                (
                    "Azure OpenAI deployment not found (404). Verify that:\n"
                    f"  - The deployment name '{model_name}' exists in resource '{azure_endpoint}'.\n"
                    f"  - The api-version '{azure_version}' supports this model.\n"
                    "  - You are using the deployment name (not base model name) if they differ.\n"
                    "Tip: In Azure Portal -> Azure OpenAI -> Deployments, copy the exact deployment name.\n"
                )
            ) from nf
        except Exception as e:
            # Allow other errors to surface later; just log for now
            print(f"[graphiti_client] Preflight check encountered non-fatal error: {e}")

        # Still set OPENAI_* for any downstream code that inspects env
        os.environ["OPENAI_API_KEY"] = azure_api_key
        os.environ["OPENAI_BASE_URL"] = azure_endpoint.rstrip('/') + "/openai"
        os.environ["OPENAI_API_VERSION"] = azure_version
        llm = AzureOpenAILLMClient(
            azure_client,
            LLMConfig(
                api_key=azure_api_key,
                model=model_name,
                small_model=small_model_name,
                base_url=azure_endpoint.rstrip('/') + "/openai",
                temperature=0.0,
            ),
        )
        _graphiti = Graphiti(
            os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            os.environ.get("NEO4J_USER", "neo4j"),
            os.environ.get("NEO4J_PASSWORD", "password"),
            llm,
        )
        # Build indices & constraints once per process
        await _graphiti.build_indices_and_constraints()
        # Ensure the property key token for entity_edges exists even before first episode creation
        # We create a throwaway node with the property then delete it so Neo4j registers the key.
        try:
            print("[graphiti_client] Seeding Neo4j property key 'entity_edges' with temp Episodic node ...")
            await _graphiti.driver.execute_query(
                "CREATE (tmp:Episodic {entity_edges: []}) WITH tmp DETACH DELETE tmp"
            )
            print("[graphiti_client] Property key 'entity_edges' seed operation completed")
        except Exception:
            # Non-fatal: if this fails we'll fall back to later backfill.
            print("[graphiti_client] Warning: property key 'entity_edges' seed operation failed (continuing)")
            pass
        # Ensure episodic nodes have entity_edges property to avoid Neo4j warnings
        try:
            records, _, _ = await _graphiti.driver.execute_query(
                "MATCH (e:Episodic) WHERE e.entity_edges IS NULL SET e.entity_edges = [] RETURN count(e) as updated"
            )
            updated = 0
            if records:
                try:
                    updated = records[0].get("updated", 0)
                except Exception:
                    pass
            print(f"[graphiti_client] Graphiti initialized. entity_edges backfilled on {updated} Episodic nodes")
        except Exception as e:
            # Non-fatal; continue even if this maintenance step fails
            print(f"[graphiti_client] Warning: failed to backfill entity_edges property: {e}")
        return _graphiti

async def close_graphiti():
    global _graphiti
    if _graphiti is not None:
        try:
            await _graphiti.close()
        finally:
            _graphiti = None
