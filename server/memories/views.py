from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from .models import Memory
from .cosmos_db import MemoriesDBManager, SummariesDBManager
from .azure_openai import azure_openai
from datetime import datetime, timezone
from django.views.decorators.csrf import csrf_exempt
import json
from django.conf import settings
import httpx
import uuid
import re  # Needed for clean_text()

# Added import for Graphiti integration
from .graphiti_client import get_graphiti  # lazy async initializer
from graphiti_core.nodes import EpisodeType  # for source type
import hashlib  # for stable episode name hash suffix

# -----------------------------
# Helper Functions
# -----------------------------
def filter_relevant_memories(query_text: str, memories: list):
    """Use Azure OpenAI to keep only memories relevant to the query.

    Args:
        query_text: The user's search text.
        memories: List of memory dicts each having at least 'id' and 'content'.

    Returns:
        Filtered list (subset) of the original memories. Returns an empty list
        if the model deems none relevant, and returns the original list if any
        unexpected error occurs during filtering.
    """
    if not memories:
        print("[filter_relevant_memories] No memories supplied; returning empty list")
        return memories
    try:
        import json as _json
        print(f"[filter_relevant_memories] Filtering {len(memories)} memories for query: {query_text[:120]}")
        candidate_min = [
            {"id": item.get("id"), "content": (item.get("content") or "")[:800]}
            for item in memories
        ]
        relevance_prompt = (
            "You are a relevance filter.\n" \
            f"User query: {query_text}\n\n" \
            "Candidate memories (JSON array):\n" \
            f"{_json.dumps(candidate_min, ensure_ascii=False)}\n\n" \
            "Return ONLY a JSON array (no prose) of the 'id' values of memories that might be helpful or relevant to address the user query (context expansion, answering, follow-up).\n" \
            "If none are relevant return []. Do not include duplicates or any explanation."
        )
        llm_raw = azure_openai.generate_completion(relevance_prompt, max_tokens=200, temperature=0)
        selected_ids = []
        if llm_raw:
            llm_text = llm_raw.strip()
            if '[' in llm_text and ']' in llm_text:
                start = llm_text.find('[')
                end = llm_text.rfind(']') + 1
                json_segment = llm_text[start:end]
                try:
                    parsed = _json.loads(json_segment)
                    if isinstance(parsed, list):
                        selected_ids = [str(x) for x in parsed]
                except Exception:
                    pass
        if selected_ids:
            filtered = [m for m in memories if str(m.get('id')) in selected_ids]
            print(f"[filter_relevant_memories] Model selected {len(filtered)} / {len(memories)} memories")
            return filtered
        else:
            # Empty means model judged none helpful
            print("[filter_relevant_memories] Model returned empty selection []")
            return []
    except Exception:
        # Fail open: return original list if filtering fails unexpectedly
        print("[filter_relevant_memories] Exception during filtering; returning original list (fail-open)")
        return memories

@api_view(['POST'])
@permission_classes([AllowAny])
def add_memory(request):
    try:
        print("[add_memory] Incoming request")
        content = request.data.get('content')
        if not content:
            print("[add_memory] Missing 'content' field")
            return JsonResponse({"error": "'content' is required"}, status=400)
        memory = Memory(content=content)
        memories_db = MemoriesDBManager()
        cosmos_item = memory.to_cosmos_item()
        created_item = memories_db.create_item(cosmos_item)
        print(f"[add_memory] Created memory id={created_item.get('id')}")
        return JsonResponse(created_item, status=201)
    except Exception as e:
        print(f"[add_memory] Exception: {e}")
        return JsonResponse({"error": str(e)}, status=400)

@api_view(['GET'])
@permission_classes([AllowAny])
def retrieve_memories(request):
    """Retrieve similar memories using vector search.

    Query params:
        q: required text to search for.
        top_k: optional integer limiting number of results.
    """
    try:
        memories_db = MemoriesDBManager()
        query_text = request.query_params.get('q')
        if not query_text:
            return JsonResponse({"error": "Missing required query parameter 'q'"}, status=400)
        print(f"[retrieve_memories] Query param q='{query_text[:100]}'")

        embedding = azure_openai.generate_embeddings(query_text)
        if embedding is None:
            print("[retrieve_memories] Failed to generate embedding")
            return JsonResponse({"error": "Failed to generate embedding"}, status=500)

        top_k_param = request.query_params.get('top_k')
        top_k = None
        if top_k_param is not None:
            try:
                top_k = int(top_k_param)
            except ValueError:
                return JsonResponse({"error": "Invalid 'top_k' parameter"}, status=400)
                
        similar = memories_db.search_similar_memories(embedding, top_k=top_k)
        print(f"[retrieve_memories] Retrieved {len(similar)} similar memories before LLM relevance filter")
        response = [
            {**mem.to_cosmos_item(), 'similarity': score}
            for mem, score in similar
        ]
        # Apply LLM-based relevance filtering (returns only useful memories or [] on low relevance)
        response = filter_relevant_memories(query_text, response)
        print(f"[retrieve_memories] Returning {len(response)} memories after relevance filter")
        return JsonResponse(response, safe=False)
    except Exception as e:
        print(f"[retrieve_memories] Exception: {e}")
        return JsonResponse({"error": str(e)}, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])
def list_memories(request):
    """List recent memories without vector search.

    Query params:
        limit: optional max number (default 50, max 200)
    """
    try:
        limit_param = request.query_params.get('limit') if hasattr(request, 'query_params') else request.GET.get('limit')
        try:
            limit = int(limit_param) if limit_param else 50
        except ValueError:
            return JsonResponse({"error": "Invalid 'limit' parameter"}, status=400)
        limit = max(1, min(limit, 200))
        db = MemoriesDBManager()
        # Cosmos SQL query sorted by created_at descending (ISO timestamps)
        query = f"""
        SELECT c.id, c.content, c.created_at, c.updated_at
        FROM c
        ORDER BY c.created_at DESC
        OFFSET 0 LIMIT {limit}
        """
        items = list(db.container.query_items(query=query, enable_cross_partition_query=True))
        return JsonResponse(items, safe=False)
    except Exception as e:
        print(f"[list_memories] Exception: {e}")
        return JsonResponse({"error": str(e)}, status=500)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([AllowAny])
def memory_detail(request, memory_id: str):
    """Retrieve, update, or delete a single memory by id.

    Methods:
        GET: return memory document
        PUT/PATCH: update content (re-embed) with body {"content": "..."}
        DELETE: remove memory
    """
    db = MemoriesDBManager()
    if request.method == "GET":
        try:
            item = db.get_item(memory_id)
            return JsonResponse(item, status=200)
        except Exception as e:
            return JsonResponse({"error": f"Memory not found: {e}"}, status=404)

    if request.method in ("PUT", "PATCH"):
        try:
            data = request.data if hasattr(request, 'data') else json.loads(request.body or b"{}")
            new_content = data.get("content")
            if not new_content:
                return JsonResponse({"error": "'content' is required"}, status=400)
            try:
                doc = db.get_item(memory_id)
            except Exception as e:
                return JsonResponse({"error": f"Memory not found: {e}"}, status=404)
            # Recompute embedding if content changed
            if doc.get("content") != new_content:
                try:
                    embedding = azure_openai.generate_embeddings(new_content)
                except Exception as ee:
                    return JsonResponse({"error": f"Failed to re-embed content: {ee}"}, status=502)
                doc["embedding"] = embedding
            doc["content"] = new_content
            doc["updated_at"] = datetime.utcnow().isoformat()
            db.upsert_item(doc)
            return JsonResponse(doc, status=200)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)

    if request.method == "DELETE":
        try:
            db.delete_item(memory_id)
            return JsonResponse({"status": "deleted", "id": memory_id})
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)

    return JsonResponse({"error": "Method not allowed"}, status=405)

def generate_conversation_id(user_id: str) -> str:
    return f"{user_id}-conv-{uuid.uuid4().hex[:8]}"

async def get_embedding_async(text: str):
    """Generate embedding from Azure OpenAI."""
    print(f"[get_embedding_async] Generating embedding len(text)={len(text)}")
    base = settings.AZURE_OPENAI_ENDPOINT.rstrip('/') if settings.AZURE_OPENAI_ENDPOINT else ''
    url = f"{base}/openai/deployments/{settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings?api-version={settings.AZURE_OPENAI_VERSION}"
    headers = {"Content-Type": "application/json", "api-key": settings.AZURE_OPENAI_KEY}
    payload = {"input": text}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["data"][0]["embedding"]
    except httpx.HTTPStatusError as he:
        # Surface Azure specific error for easier debugging
        print(f"[get_embedding_async] HTTPStatusError: {he.response.status_code}")
        raise RuntimeError(f"Embedding request failed {he.response.status_code}: {he.response.text}") from he
    except Exception as e:
        print(f"[get_embedding_async] Exception: {e}")
        raise RuntimeError(f"Embedding request error: {e}") from e


async def llm_generate_async(prompt: str, system: str = None, max_tokens: int = 256):
    """Call Azure OpenAI Chat (gpt-4o-mini)."""
    print(f"[llm_generate_async] system='{(system or '')[:40]}' prompt_len={len(prompt)} max_tokens={max_tokens}")
    base = settings.AZURE_OPENAI_ENDPOINT.rstrip('/') if settings.AZURE_OPENAI_ENDPOINT else ''
    url = f"{base}/openai/deployments/{settings.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={settings.AZURE_OPENAI_VERSION}"
    headers = {"Content-Type": "application/json", "api-key": settings.AZURE_OPENAI_KEY}
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {"messages": messages, "max_tokens": max_tokens}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except httpx.HTTPStatusError as he:
        print(f"[llm_generate_async] HTTPStatusError: {he.response.status_code}")
        raise RuntimeError(f"Chat request failed {he.response.status_code}: {he.response.text}") from he
    except Exception as e:
        print(f"[llm_generate_async] Exception: {e}")
        raise RuntimeError(f"Chat request error: {e}") from e


def clean_text(txt: str) -> str:
    """
    Normalize candidate text so embeddings are comparable.
    Removes boilerplate like **Candidate Memory:**, Memory Entry:, Summary:, etc.
    """
    txt = re.sub(r"\*\*.*?\*\*:?|Memory Entry:|Candidate Memory:|Summary:|Details:", "", txt)
    return txt.strip()


async def decide_action(candidate_text: str, neighbors: list,
                        threshold_add=0.45, threshold_update=0.65,
                        threshold_noop=0.85):
    """
    Decide whether to ADD, UPDATE, DELETE, or NO-OP.
    Uses thresholds for similarity, and LLM to decide UPDATE vs DELETE/CONTRADICTS_EXISTING.
    """
    candidate_text = clean_text(candidate_text)

    print("\n=== DECISION DEBUG ===")
    print(f"Candidate: {candidate_text}")
    print(f"Thresholds -> ADD<{threshold_add}, UPDATE<{threshold_update}, NO-OP>{threshold_noop}")

    if not neighbors:
        print("No neighbors found -> Action: ADD\n")
        return "ADD", None

    # Normalize neighbors into (memory, score) tuples
    normalized = []
    for n in neighbors:
        if isinstance(n, tuple) and len(n) == 2:
            normalized.append(n)
        elif isinstance(n, dict):
            mem_obj = type("Memory", (), {})()
            mem_obj.id = n.get("id")
            mem_obj.content = n.get("content")
            normalized.append((mem_obj, float(n.get("score", 0.0))))
        else:
            print(f"Skipping invalid neighbor format: {n}")

    if not normalized:
        print("No valid neighbors after normalization -> Action: ADD\n")
        return "ADD", None

    # Pick the best matching memory
    best_memory, best_score = max(normalized, key=lambda x: x[1])
    print(f"Best Match: ID={best_memory.id}, Score={best_score:.4f}")
    print(f"Best Content: {best_memory.content}")

    # Threshold-based quick decisions
    if best_score < threshold_add:
        decision, ref_id = "ADD", None
    elif best_score >= threshold_noop:
        decision, ref_id = "NO-OP", best_memory.id
    else:
        # Let LLM decide UPDATE or DELETE/CONTRADICTS_EXISTING
        decision_prompt = f"""
Existing memory:
{best_memory.content}

Candidate memory:
{candidate_text}

Decide ONE action:
- UPDATE (merge into existing memory)
- CONTRADICTS_EXISTING (new info contradicts existing, delete old memory)
"""
        llm_decision = await llm_generate_async(decision_prompt, system="You are a precise memory manager.")
        llm_decision = llm_decision.strip().upper()

        if llm_decision in ["DELETE", "CONTRADICTS_EXISTING"]:
            decision, ref_id = "DELETE", best_memory.id
        else:
            decision, ref_id = "UPDATE", best_memory.id

    print(f"Final Decision: {decision} (ref_id={ref_id})")
    print("======================\n")
    return decision, ref_id


# -----------------------------
# Graphiti Episode Ingestion Helpers (parity with scripts/insert_episode.py)
# -----------------------------
def iso_now() -> str:
    """Timezone-aware UTC ISO string (matches script style)."""
    return datetime.now(timezone.utc).isoformat()


async def ingest_graphiti_episode(body: str, source_desc: str = "processed_memory", name: str | None = None):
    """Ingest a single episode into Graphiti.

    Mirrors the logic in scripts/insert_episode.py so test scripts & runtime are consistent.
    Adds a short content hash to reduce accidental duplicate names when multiple episodes
    are created within the same second (timestamp collisions).
    """
    graphiti = await get_graphiti()
    # Short hash based on body (content changes -> different name); safe if body very short.
    hash_part = hashlib.sha1(body.encode("utf-8")).hexdigest()[:8]
    ep_name = name or f"memory-{iso_now()}-{hash_part}"
    resp = await graphiti.add_episode(
        name=ep_name,
        episode_body=body,
        source=EpisodeType.text,
        source_description=source_desc,
        reference_time=datetime.now(timezone.utc),  # explicit tz-aware
    )
    return ep_name, resp


@csrf_exempt
async def process_memory(request):
    """Process an incoming chat message into the memory system.

    Expected JSON body (all required):
      {
        "message": "<user utterance>",
        "userId": "<stable user id>",
        "conversationId": "<stable conversation id>"
      }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        body = request.body or b""
        body_len = len(body)
        print(f"[process_memory] Received POST body size={body_len}")
        # Defensive: log truncated body for debugging
        try:
            raw_preview = body.decode("utf-8")[:500]
            print(f"[process_memory] Body preview: {raw_preview}")
        except Exception:
            print("[process_memory] Body could not be decoded as UTF-8")

        if body_len == 0:
            return JsonResponse({"error": "Empty request body"}, status=400)

        # Parse JSON
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as je:
            print(f"[process_memory] JSON decode error: {je}")
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        # Flexible key handling (allow camelCase / snake_case / legacy)
        def pick(d, *names):
            for n in names:
                if n in d:
                    return d[n]
            return None

        message = (pick(payload, "message", "text", "content") or "").strip()
        user_id = pick(payload, "userId", "user_id", "userid", "user")
        conversation_id = pick(payload, "conversationId", "conversation_id", "conversation", "convId")

        missing = []
        if not message:
            missing.append("message")
        if not user_id:
            missing.append("userId")
        if not conversation_id:
            missing.append("conversationId")
        if missing:
            print(f"[process_memory] Validation failed missing={missing} keys_present={list(payload.keys())}")
            return JsonResponse({
                "error": "Missing required field(s)",
                "missing": missing,
                "receivedKeys": list(payload.keys())
            }, status=400)

        summaries_db = SummariesDBManager()

        # Fetch previous summary (id should match conversation_id for consistency)
        previous_summary = ""
        try:
            existing_summary_doc = summaries_db.get_item(conversation_id)
            if existing_summary_doc:
                previous_summary = existing_summary_doc.get("summary", "")
                print(f"[process_memory] Loaded previous summary length={len(previous_summary)}")
        except Exception as e:
            print(f"[process_memory] No previous summary found (ok). Details: {e}")

        summary_prompt = (
            f"Previous summary:\n{previous_summary}\n\n"
            f"New message:\n{message}\n\n"
            f"Update the summary:"
        )
        try:
            new_summary = await llm_generate_async(summary_prompt, system="You are a concise summarizer.")
            print("[process_memory] Generated new summary")
        except Exception as e:
            print(f"[process_memory] Summary generation failed: {e}")
            return JsonResponse({"error": f"Failed to generate summary: {e}"}, status=502)

        # Maintain rolling window of last N messages
        last_n = 5
        try:
            existing_summary_doc = summaries_db.get_item(conversation_id)
        except Exception:
            existing_summary_doc = None

        if existing_summary_doc:
            last_messages = existing_summary_doc.get("lastNMessages", [])
            last_messages.append(message)
            last_messages = last_messages[-last_n:]
        else:
            last_messages = [message]

        # IMPORTANT: use conversation_id as the partition/id for summary retrieval consistency
        summary_item = {
            "id": conversation_id,
            "userId": user_id,
            "conversationId": conversation_id,
            "summary": new_summary,
            "lastNMessages": last_messages,
            "updatedAt": datetime.utcnow().isoformat()
        }
        try:
            summaries_db.upsert_item(summary_item)
            print(f"[process_memory] Upserted summary doc id={conversation_id}")
        except Exception as e:
            print(f"[process_memory] Failed to upsert summary: {e}")

        # Candidate memory generation
        memory_prompt = (
            f"Based on:\nSummary: {new_summary}\nNew message: {message}\n\n"
            f"Write a short candidate memory:"
        )
        try:
            candidate_memory = await llm_generate_async(memory_prompt, system="You are a memory creator.")
            print("[process_memory] Generated candidate memory")
        except Exception as e:
            print(f"[process_memory] Candidate memory generation failed: {e}")
            return JsonResponse({"error": f"Failed to generate candidate memory: {e}"}, status=502)

        try:
            candidate_embedding = await get_embedding_async(candidate_memory)
            print("[process_memory] Generated embedding for candidate memory")
        except Exception as e:
            print(f"[process_memory] Embedding generation failed: {e}")
            return JsonResponse({"error": f"Failed to embed candidate memory: {e}"}, status=502)

        memories_db = MemoriesDBManager()
        neighbors = memories_db.search_similar_memories(candidate_embedding, top_k=5)
        print(f"[process_memory] Retrieved {len(neighbors)} neighbors for candidate memory")

        action, target_id = await decide_action(candidate_memory, neighbors)
        result = {"action": action, "candidate_memory": candidate_memory}

        if action == "ADD":
            item = {
                "id": str(uuid.uuid4()),
                "userId": user_id,
                "conversationId": conversation_id,
                "content": candidate_memory,
                "embedding": candidate_embedding,
                "created_at": datetime.utcnow().isoformat()
            }
            try:
                memories_db.create_item(item)
                result["status"] = "Added new memory"
                print(f"[process_memory] Added new memory id={item['id']}")
            except Exception as e:
                result["status"] = f"Failed to add memory: {e}"
                print(f"[process_memory] Create memory failed: {e}")

        elif action == "UPDATE" and target_id:
            try:
                doc = memories_db.get_item(target_id)
                print("\n>>> MEMORY TO BE UPDATED <<<")
                print(f"ID: {doc.get('id')}")
                print(f"Content: {doc.get('content')}")
                print(">>> =======================\n")
                merged_prompt = (
                    f"Existing memory:\n{doc['content']}\n\n"
                    f"Candidate memory:\n{candidate_memory}\n\n"
                    f"Merge them into one improved memory:"
                )
                merged_text = await llm_generate_async(merged_prompt, system="You merge memories into better ones.")
                try:
                    new_emb = await get_embedding_async(merged_text)
                except Exception as e:
                    print(f"[process_memory] Re-embedding merged memory failed: {e}")
                    return JsonResponse({"error": f"Failed to re-embed merged memory: {e}"}, status=502)
                doc["content"] = merged_text
                doc["embedding"] = new_emb
                memories_db.upsert_item(doc)
                result["status"] = f"Updated memory {target_id}"
                print(f"[process_memory] Updated memory id={target_id}")
            except Exception as e:
                result["status"] = f"Failed to update memory: {e}"
                print(f"[process_memory] Update failed for id={target_id}: {e}")

        elif action == "DELETE" and target_id:
            try:
                doc_to_delete = memories_db.get_item(target_id)
                print("\n>>> MEMORY TO BE DELETED <<<")
                print(f"ID: {doc_to_delete.get('id')}")
                print(f"Content: {doc_to_delete.get('content')}")
                print(">>> =======================\n")
                memories_db.delete_item(target_id)
                replacement = {
                    "id": str(uuid.uuid4()),
                    "userId": user_id,
                    "conversationId": conversation_id,
                    "content": candidate_memory,
                    "embedding": candidate_embedding,
                    "created_at": datetime.utcnow().isoformat()
                }
                memories_db.create_item(replacement)
                result["status"] = f"Deleted {target_id} and replaced with candidate memory"
            except Exception as e:
                result["status"] = f"Failed to delete memory: {e}"
                print(f"[process_memory] Delete failed for id={target_id}: {e}")
        else:
            result["status"] = "No operation performed"

        result["new_summary"] = new_summary

        # Optional Graphiti ingestion (toggle via settings.GRAPHITI_INGEST_ENABLED = False to disable)
        graphiti_enabled = getattr(settings, "GRAPHITI_INGEST_ENABLED", True)
        if graphiti_enabled:
            try:
                ep_name, _ = await ingest_graphiti_episode(candidate_memory, source_desc="processed_memory")
                result["graphiti"] = {"ingested": True, "episode_name": ep_name}
                print(f"[process_memory] Graphiti ingestion succeeded episode={ep_name}")
            except Exception as ge:
                result["graphiti"] = {"ingested": False, "error": str(ge)}
                print(f"[process_memory] Graphiti ingestion failed: {ge}")
        else:
            result["graphiti"] = {"ingested": False, "skipped": True, "reason": "disabled via settings"}
            print("[process_memory] Graphiti ingestion skipped (disabled via settings)")

        return JsonResponse(result, safe=False)

    except Exception as e:
        print(f"[process_memory] Unhandled exception: {e}")
        return JsonResponse({"error": str(e)}, status=500)