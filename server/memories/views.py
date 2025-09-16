from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
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
        return Response(created_item, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def retrieve_memories(request):
    try:
        items = cosmos_db.get_all_items()
        memories = [Memory.from_cosmos_item(item) for item in items]
        memories_data = [memory.to_cosmos_item() for memory in memories]
        return Response(memories_data)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
