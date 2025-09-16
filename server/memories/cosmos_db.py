from azure.cosmos import CosmosClient, PartitionKey
from django.conf import settings

class CosmosDBManager:
    def __init__(self):
        self.client = CosmosClient(
            settings.COSMOS_DB_HOST,
            settings.COSMOS_DB_KEY
        )
        self.database = self.client.get_database_client(settings.COSMOS_DB_NAME)
        self.container = self.database.get_container_client(settings.COSMOS_DB_CONTAINER)

    def get_all_items(self):
        return list(self.container.read_all_items())

    def create_item(self, item):
        return self.container.create_item(body=item)

    def get_item(self, id):
        return self.container.read_item(item=id, partition_key=id)

    def search_similar_memories(self, query_embedding, top_k=5):
        """
        Find similar memories using vector similarity search
        
        Args:
            query_embedding (list): The embedding vector to search for
            top_k (int): Number of similar memories to return
        
        Returns:
            list: List of similar memories sorted by similarity score
        """
        all_items = self.get_all_items()
        from .models import Memory  # Import here to avoid circular import
        
        # Convert items to Memory objects and calculate similarity
        memories = [Memory.from_cosmos_item(item) for item in all_items]
        similarities = [
            (memory, azure_openai.calculate_similarity(query_embedding, memory.embedding))
            for memory in memories
        ]
        
        # Sort by similarity score and return top_k
        similar_memories = sorted(similarities, key=lambda x: x[1], reverse=True)[:top_k]
        return similar_memories

cosmos_db = CosmosDBManager()