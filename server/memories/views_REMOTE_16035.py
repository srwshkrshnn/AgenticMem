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

@api_view(['POST'])
def add_memory(request):
    try:
        memory = Memory(
            title=request.data.get('title'),
            content=request.data.get('content')
        )
        memories_db = MemoriesDBManager()
        cosmos_item = memory.to_cosmos_item()
        created_item = memories_db.create_item(cosmos_item)
        return JsonResponse(created_item, status=201)
    except Exception as e:
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

        embedding = azure_openai.generate_embeddings(query_text)
        if embedding is None:
            return JsonResponse({"error": "Failed to generate embedding"}, status=500)

        top_k_param = request.query_params.get('top_k')
        top_k = None
        if top_k_param is not None:
            try:
                top_k = int(top_k_param)
            except ValueError:
                return JsonResponse({"error": "Invalid 'top_k' parameter"}, status=400)
                
        similar = memories_db.search_similar_memories(embedding, top_k=top_k)
        response = [
            {
                **mem.to_cosmos_item(),
                'similarity': score
            }
            for mem, score in similar
        ]
        return JsonResponse(response, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

def generate_conversation_id(user_id: str) -> str:
    return f"{user_id}-conv-{uuid.uuid4().hex[:8]}"

async def get_embedding_async(text: str):
    """Generate embedding from Azure OpenAI."""
    url = f"{settings.AZURE_OPENAI_ENDPOINT}/openai/deployments/{settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings?api-version=2023-05-15"
    headers = {"Content-Type": "application/json", "api-key": settings.AZURE_OPENAI_KEY}
    payload = {"input": text}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]


async def llm_generate_async(prompt: str, system: str = None, max_tokens: int = 256):
    """Call Azure OpenAI Chat (gpt-4o-mini)."""
    url = f"{settings.AZURE_OPENAI_ENDPOINT}/openai/deployments/{settings.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-05-15"
    headers = {"Content-Type": "application/json", "api-key": settings.AZURE_OPENAI_KEY}
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {"messages": messages, "max_tokens": max_tokens}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()

async def vector_search(embedding, top_k=5):
    query = {
        "vector": {
            "path": "/embedding",
            "topK": top_k,
            "vector": embedding,
            "includeSimilarityScore": True
        }
    }
    def sync_query():
        return list(memories_container.query_items(query=query, enable_cross_partition_query=True))
    
    results = await asyncio.to_thread(sync_query)
    return results


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


@csrf_exempt
async def process_memory(request):
    if request.method == "POST":
        try:
            # ✅ Parse JSON payload
            body = request.body
            payload = json.loads(body.decode("utf-8"))

            message = payload.get("message", "").strip()
            if not message:
                return JsonResponse({"error": "Please provide 'message'"}, status=400)

            user_id = payload.get("userId")
            conversation_id = payload.get("conversationId")
            if not user_id or not conversation_id:
                return JsonResponse({"error": "Please provide both 'userId' and 'conversationId'"}, status=400)

            summaries_db = SummariesDBManager()  
            previous_summary = ""
            try:
                existing_summary_doc = summaries_db.get_item(conversation_id)
                if existing_summary_doc:
                    previous_summary = existing_summary_doc.get("summary", "")
            except Exception:
                pass  

            # 1. Generate new summary
            summary_prompt = (
                f"Previous summary:\n{previous_summary}\n\n"
                f"New message:\n{message}\n\n"
                f"Update the summary:"
            )
            new_summary = await llm_generate_async(summary_prompt, system="You are a concise summarizer.")

            # Track last N messages
            existing_summary_doc = None
            try:
                existing_summary_doc = summaries_db.get_item(conversation_id)
            except Exception:
                pass  

            last_n = 5
            if existing_summary_doc:
                last_messages = existing_summary_doc.get("lastNMessages", [])
                last_messages.append(message)
                last_messages = last_messages[-last_n:]
            else:
                last_messages = [message]

            summary_item = {        
                "id": user_id,
                "conversationId": conversation_id,
                "summary": new_summary,
                "lastNMessages": last_messages,
                "updatedAt": datetime.utcnow().isoformat()
            }
            summaries_db.upsert_item(summary_item)

            # 2. Candidate memory generation
            memory_prompt = (
                f"Based on:\nSummary: {new_summary}\nNew message: {message}\n\n"
                f"Write a short candidate memory:"
            )
            candidate_memory = await llm_generate_async(memory_prompt, system="You are a memory creator.")
            candidate_embedding = await get_embedding_async(candidate_memory)

            memories_db = MemoriesDBManager()
            neighbors = memories_db.search_similar_memories(candidate_embedding, top_k=5)

            action, target_id = await decide_action(candidate_memory, neighbors)

            result = {"action": action, "candidate_memory": candidate_memory}

            if action == "ADD":
                item = {
                    "id": user_id,
                    "conversationId": conversation_id,
                    "content": candidate_memory,
                    "embedding": candidate_embedding,
                    "created_at": datetime.utcnow().isoformat()
                }
                memories_db.create_item(item)
                result["status"] = "Added new memory"

            elif action == "UPDATE" and target_id:
                try:
                    doc = memories_db.get_item(target_id)
                    print("\n>>> MEMORY TO BE Updated <<<")
                    print(f"ID: {doc['id']}")
                    print(f"Content: {doc['content']}")
                    print(">>> =======================\n")
                    merged_prompt = (
                        f"Existing memory:\n{doc['content']}\n\n"
                        f"Candidate memory:\n{candidate_memory}\n\n"
                        f"Merge them into one improved memory:"
                    )
                    merged_text = await llm_generate_async(merged_prompt, system="You merge memories into better ones.")
                    new_emb = await get_embedding_async(merged_text)
                    doc["content"] = merged_text
                    doc["embedding"] = new_emb
                    memories_db.upsert_item(doc)
                    result["status"] = f"Updated memory {target_id}"
                except Exception as e:
                    result["status"] = f"Failed to update: {str(e)}"

            elif action == "DELETE" and target_id:
                try:
                    # Log before deleting
                    doc_to_delete = memories_db.get_item(target_id)
                    print("\n>>> MEMORY TO BE DELETED <<<")
                    print(f"ID: {doc_to_delete['id']}")
                    print(f"Content: {doc_to_delete['content']}")
                    print(">>> =======================\n")

                    memories_db.delete_item(target_id)
                    # Insert candidate memory after deletion
                    new_doc = {
                        "id": str(uuid.uuid4()),
                        "userId": user_id,
                        "conversationId": conversation_id,
                        "content": candidate_memory,
                        "embedding": candidate_embedding,
                        "created_at": datetime.utcnow().isoformat()
                    }
                    memories_db.create_item(new_doc)
                    result["status"] = f"Deleted {target_id} and replaced with candidate memory"
                except Exception as e:
                    result["status"] = f"Failed to delete: {str(e)}"

            else:
                result["status"] = "No operation performed"

            result["new_summary"] = new_summary
            return JsonResponse(result, safe=False)

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Method not allowed"}, status=405)