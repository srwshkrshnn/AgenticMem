from django.http import JsonResponse
from rest_framework.decorators import api_view
from .models import Memory
from .cosmos_db import MemoriesDBManager,SummariesDBManager
from .azure_openai import azure_openai
from datetime import datetime

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

        # Build embedding for query text
        embedding = azure_openai.generate_embeddings(query_text)
        if embedding is None:
            return JsonResponse({"error": "Failed to generate embedding"}, status=500)

        # Parse top_k (fallback handled inside search function too)
        top_k_param = request.query_params.get('top_k')
        top_k = None
        if top_k_param is not None:
            try:
                top_k = int(top_k_param)
            except ValueError:
                return JsonResponse({"error": "Invalid 'top_k' parameter"}, status=400)

        similar = memories_db.search_similar_memories(embedding, top_k=top_k)
        # similar is list[(Memory, similarity)]
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
