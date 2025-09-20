import os
import asyncio
from typing import Optional

from graphiti_core import Graphiti
from graphiti_core.llm_client.azure_openai_client import AzureOpenAILLMClient  # original (fallback)
from .azure_llm_client_patch import PatchedAzureOpenAILLMClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from openai import AsyncAzureOpenAI, NotFoundError

# Lazy-initialized singleton Graphiti instance
_graphiti: Optional[Graphiti] = None
_lock = asyncio.Lock()

"""Graphiti Azure OpenAI client bootstrap.

This module now mirrors the guidance in `README_GRAPHITI_AZURE.md`, supporting:

1. Separate Azure OpenAI endpoints for LLM vs Embeddings.
    - AZURE_OPENAI_LLM_ENDPOINT (optional) overrides AZURE_OPENAI_ENDPOINT for chat models
    - AZURE_OPENAI_EMBEDDING_ENDPOINT (optional) overrides for embedding models
2. Distinct deployment names for:
    - Chat / reasoning model: AZURE_OPENAI_DEPLOYMENT (required)
    - Small / cheaper model (reranking & light tasks): AZURE_OPENAI_SMALL_DEPLOYMENT (optional; falls back to main)
    - Embeddings: AZURE_OPENAI_EMBEDDING_DEPLOYMENT (optional; enables vector store & rerank quality)
3. Cross encoder (reranker) using the small model via OpenAIRerankerClient.
4. Preflight validation of deployments to yield early actionable errors (especially 404).

Environment Variables Summary:
  AZURE_OPENAI_KEY (required)
  AZURE_OPENAI_VERSION (required – must be opted into v1 API for structured outputs)
  AZURE_OPENAI_ENDPOINT (base fallback endpoint)
  AZURE_OPENAI_LLM_ENDPOINT (optional specific endpoint for LLM)
  AZURE_OPENAI_EMBEDDING_ENDPOINT (optional specific endpoint for embeddings)
  AZURE_OPENAI_DEPLOYMENT (chat model deployment name – NOT the base model name)
  AZURE_OPENAI_SMALL_DEPLOYMENT (small model deployment name)
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT (embedding model deployment name)
  NEO4J_URI (default bolt://localhost:7687)
  NEO4J_USER (default neo4j)
  NEO4J_PASSWORD (default password)

Notes:
* If you encounter 404 Resource not found during episode ingestion, ensure your Azure OpenAI resource has opted into the v1 API version family and deployment names are correct.
* We intentionally keep the legacy single-endpoint behaviour for backward compatibility when the new *_LLM_ENDPOINT / *_EMBEDDING_ENDPOINT vars are not set.
"""

async def get_graphiti() -> Graphiti:
    global _graphiti
    if _graphiti is not None:
        return _graphiti
    async with _lock:
        if _graphiti is not None:
            return _graphiti
        # --- Core required credentials ---
        base_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        azure_api_key = os.environ.get("AZURE_OPENAI_KEY")
        if not base_endpoint or not azure_api_key:
            raise RuntimeError("Azure-only mode: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY must be set")
        azure_version = os.environ.get("AZURE_OPENAI_VERSION")
        if not azure_version:
            raise RuntimeError("AZURE_OPENAI_VERSION must be set for Azure OpenAI usage (see README_GRAPHITI_AZURE.md)")

        # Specific (optional) endpoints for LLM and Embeddings; fall back to base if unset.
        llm_endpoint = os.environ.get("AZURE_OPENAI_LLM_ENDPOINT", base_endpoint)
        embedding_endpoint = os.environ.get("AZURE_OPENAI_EMBEDDING_ENDPOINT", base_endpoint)

        # Auto-upgrade heuristic for newer model families if an outdated version is provided.
        upgraded_version = None
        if ("4o" in (os.environ.get("AZURE_OPENAI_DEPLOYMENT") or "") or "gpt-4.1" in (os.environ.get("AZURE_OPENAI_DEPLOYMENT") or "")) and azure_version < "2024-02-01":
            # Newer model families generally need a 2024+ api-version.
            upgraded_version = "2024-06-01"
            print(
                f"[graphiti_client] INFO: Overriding outdated AZURE_OPENAI_VERSION '{azure_version}' with '{upgraded_version}' for modern deployment"
            )
            azure_version = upgraded_version
            os.environ["AZURE_OPENAI_VERSION"] = azure_version

        # Deployment names are treated as model identifiers through the OpenAI-compatible interface
        model_name = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
        if not model_name:
            raise RuntimeError("AZURE_OPENAI_DEPLOYMENT must be set (deployment name, not base model name)")
        small_model_name = os.environ.get("AZURE_OPENAI_SMALL_DEPLOYMENT", model_name)

        embed_deployment = os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
        if embed_deployment and embed_deployment.startswith("text-embedding-ada-002"):
            print(
                "[graphiti_client] WARNING: 'text-embedding-ada-002' is legacy; deploy 'text-embedding-3-small' or 'text-embedding-3-large' instead."
            )

        # Provide an AzureOpenAI client to the generic wrapper so it hits the correct Azure paths
        # NOTE: The generic wrapper will call chat.completions.create(model=<deployment_name>, ...)
        # which is compatible with AzureOpenAI client.
        llm_azure_client = AsyncAzureOpenAI(
            api_key=azure_api_key,
            api_version=azure_version,
            azure_endpoint=llm_endpoint.rstrip('/'),
        )

        embedding_azure_client: Optional[AsyncAzureOpenAI] = None
        if embed_deployment:
            embedding_azure_client = AsyncAzureOpenAI(
                api_key=azure_api_key,
                api_version=azure_version,
                azure_endpoint=embedding_endpoint.rstrip('/'),
            )
        # Basic debug to aid diagnosing 404 (deployment not found) issues
        try:
            print(
                f"[graphiti_client] Azure OpenAI LLM endpoint={llm_endpoint.rstrip('/')} deployment={model_name} version={azure_version}"
            )
            if embed_deployment:
                print(
                    f"[graphiti_client] Azure OpenAI Embedding endpoint={embedding_endpoint.rstrip('/')} embedding_deployment={embed_deployment}"
                )
        except Exception:
            pass

        # ------------------------------------------------------------------
        # Preflight: validate deployment exists & api-version supports model.
        # This provides an early, clear error instead of opaque retries later.
        # ------------------------------------------------------------------
        try:
            # Heuristic warning for obviously outdated API version with modern models
            if ("4o" in model_name or "o1" in model_name or "o3" in model_name or "gpt-4.1" in model_name) and azure_version.startswith("2023-"):
                print("[graphiti_client] WARNING: API version appears old for a modern model; consider upgrading AZURE_OPENAI_VERSION (e.g. 2024-06-01).")
            preflight_resp = await llm_azure_client.chat.completions.create(
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
                    f"  - The deployment name '{model_name}' exists in resource '{llm_endpoint}'.\n"
                    f"  - The api-version '{azure_version}' supports this model.\n"
                    "  - You are using the deployment name (not base model name) if they differ.\n"
                    "Tip: In Azure Portal -> Azure OpenAI -> Deployments, copy the exact deployment name.\n"
                )
            ) from nf
        except Exception as e:
            # Allow other errors to surface later; just log for now
            print(f"[graphiti_client] Preflight check encountered non-fatal error: {e}")

        # Optional embedding preflight
        if embed_deployment and embedding_azure_client:
            try:
                emb_resp = await embedding_azure_client.embeddings.create(
                    model=embed_deployment,
                    input=["ping"],
                )
                if not emb_resp or not getattr(emb_resp, 'data', None):
                    print("[graphiti_client] WARNING: Embedding preflight returned no data; continuing anyway.")
                else:
                    print("[graphiti_client] Embedding preflight succeeded.")
            except NotFoundError:
                print(
                    "[graphiti_client] ERROR: Embedding deployment not found (AZURE_OPENAI_EMBEDDING_DEPLOYMENT). Embedding features will be disabled."
                )
                embedding_azure_client = None
            except Exception as e:  # non-fatal
                print(f"[graphiti_client] Embedding preflight non-fatal error: {e}")

        # Still set OPENAI_* for any downstream code that inspects env (compat layer expectation)
        os.environ["OPENAI_API_KEY"] = azure_api_key
        os.environ["OPENAI_BASE_URL"] = llm_endpoint.rstrip('/') + "/openai"
        os.environ["OPENAI_API_VERSION"] = azure_version

        # Use patched client to accept reasoning/verbosity kwargs expected by BaseOpenAIClient
        llm_client = PatchedAzureOpenAILLMClient(
            llm_azure_client,
            LLMConfig(
                api_key=azure_api_key,
                model=model_name,
                small_model=small_model_name,
                base_url=llm_endpoint.rstrip('/') + "/openai",
                temperature=0.0,
            ),
        )

        embedder = None
        if embedding_azure_client and embed_deployment:
            embedder = OpenAIEmbedder(
                config=OpenAIEmbedderConfig(embedding_model=embed_deployment),
                client=embedding_azure_client,
            )

        cross_encoder = OpenAIRerankerClient(
            config=LLMConfig(model=small_model_name),
            client=llm_azure_client,
        ) if small_model_name else None

        _graphiti = Graphiti(
            os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            os.environ.get("NEO4J_USER", "neo4j"),
            os.environ.get("NEO4J_PASSWORD", "password"),
            llm_client,
            embedder=embedder,
            cross_encoder=cross_encoder,
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
