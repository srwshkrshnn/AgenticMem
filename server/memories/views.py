from django.http import JsonResponse
from rest_framework.decorators import api_view
from .models import Memory
from .cosmos_db import MemoriesDBManager,SummariesDBManager
from .azure_openai import azure_openai
from datetime import datetime
from django.views.decorators.csrf import csrf_exempt
import json
from django.conf import settings
import httpx
import uuid

# Added import for Graphiti integration
from .graphiti_client import get_graphiti  # lazy async initializer
from graphiti_core.nodes import EpisodeType  # for source type

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

# -----------------------------
# Embeddings
# -----------------------------
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

async def decide_action(candidate_text: str, neighbors: list):
    """
    Decide whether to ADD, UPDATE, DELETE, or NO-OP.
    """
    print(f"[decide_action] candidate_len={len(candidate_text)} neighbors_count={len(neighbors)}")
    if not neighbors:
        return "ADD", None

    best_memory, best_score = max(neighbors, key=lambda x: x[1])

    decision_prompt = f"""
Existing memory (best match):
ID: {best_memory.id}
Content: {best_memory.content}

Candidate memory:
{candidate_text}

Decide ONE action:
- ADD (create new memory)
- UPDATE (merge into existing memory)
- DELETE (remove existing memory)
- NO-OP (do nothing)

Reply ONLY with the action word (ADD/UPDATE/DELETE/NO-OP).
"""
    decision = await llm_generate_async(decision_prompt, system="You are a precise memory manager.")
    decision = decision.strip().upper()
    print(f"[decide_action] Raw decision='{decision}' best_memory_id={best_memory.id}")

    if decision.startswith("UPDATE"):
        return "UPDATE", best_memory.id
    elif decision.startswith("DELETE"):
        return "DELETE", best_memory.id
    elif decision.startswith("ADD"):
        return "ADD", None
    else:
        return "NO-OP", None

@csrf_exempt
async def process_memory(request):
    if request.method == "POST":
        try:
            # ✅ Parse JSON payload manually
            body = request.body
            payload = json.loads(body.decode("utf-8"))
            print(f"[process_memory] Received POST body size={len(body)}")
            

            message = payload.get("message", "").strip()
            if not message:
                print("[process_memory] Missing 'message' in payload")
                return JsonResponse({"error": "Please provide 'message'"}, status=400)

            previous_summary = payload.get("previous_summary", "")

            # 1. Generate new summary
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

            summaries_db = SummariesDBManager()  
           
            conversation_id = payload.get("conversationId", "dummy-conv")
            user_id = payload.get("userId", "dummy-user")

            existing_summary_doc = None
            try:
                existing_summary_doc = summaries_db.get_item(conversation_id)
                print(f"[process_memory] Found existing summary doc for conversation_id={conversation_id}")
            except Exception:
                print(f"[process_memory] No existing summary doc for conversation_id={conversation_id}")
                pass  

            last_n = 5  
            if existing_summary_doc:
              
                last_messages = existing_summary_doc.get("lastNMessages", [])
                last_messages.append(message)
                last_messages = last_messages[-last_n:]
            else:
               
                last_messages = [message]

            summary_item = {
                "id": conversation_id,           
                "userId": user_id,
                "conversationId": conversation_id,
                "summary": new_summary,
                "lastNMessages": last_messages,
                "updatedAt": datetime.utcnow().isoformat()
            }

            summaries_db.upsert_item(summary_item)
            print(f"[process_memory] Upserted summary doc id={conversation_id}")

            # 2. Candidate memory generation
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
                    "content": candidate_memory,
                    "embedding": candidate_embedding,
                    "created_at": datetime.utcnow().isoformat()
                }
                memories_db.create_item(item)
                result["status"] = "Added new memory"
                print(f"[process_memory] Added new memory id={item['id']}")

            elif action == "UPDATE" and target_id:
                try:
                    doc = memories_db.get_item(target_id)
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
                    result["status"] = f"Failed to update: {str(e)}"
                    print(f"[process_memory] Update failed for id={target_id}: {e}")

            elif action == "DELETE" and target_id:
                try:
                    memories_db.delete_item(target_id)
                    result["status"] = f"Deleted memory {target_id}"
                    print(f"[process_memory] Deleted memory id={target_id}")
                except Exception as e:
                    result["status"] = f"Failed to delete: {str(e)}"
                    print(f"[process_memory] Delete failed for id={target_id}: {e}")

            else:
                result["status"] = "No operation performed"

            result["new_summary"] = new_summary

            # -----------------------------
            # Graphiti Ingestion (best-effort)
            # -----------------------------
            # We map the candidate/merged memory (or new summary) into a Graphiti episode
            try:
                graphiti = await get_graphiti()
                episode_body = candidate_memory
                await graphiti.add_episode(
                    name=f"memory-{datetime.utcnow().isoformat()}",
                    episode_body=episode_body,
                    source=EpisodeType.text,
                    source_description="processed_memory",
                    reference_time=datetime.utcnow(),
                )
                result["graphiti"] = {"ingested": True}
                print("[process_memory] Graphiti ingestion succeeded")
            except Exception as ge:
                # Swallow errors so primary flow isn't disrupted
                result["graphiti"] = {"ingested": False, "error": str(ge)}
                print(f"[process_memory] Graphiti ingestion failed: {ge}")

            return JsonResponse(result, safe=False)

        except Exception as e:
            print(f"[process_memory] Unhandled exception: {e}")
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Method not allowed"}, status=405)