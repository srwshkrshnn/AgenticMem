from django.http import JsonResponse
from rest_framework.decorators import api_view
from .models import Memory
from .cosmos_db import cosmos_db
from datetime import datetime

@api_view(['POST'])
def add_memory(request):
    try:
        memory = Memory(
            title=request.data.get('title'),
            content=request.data.get('content')
        )
        cosmos_item = memory.to_cosmos_item()
        created_item = cosmos_db.create_item(cosmos_item)
        return JsonResponse(created_item, status=201)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

@api_view(['GET'])
def retrieve_memories(request):
    try:
        items = cosmos_db.get_all_items()
        memories = [Memory.from_cosmos_item(item) for item in items]
        memories_data = [memory.to_cosmos_item() for memory in memories]
        return JsonResponse(memories_data, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
