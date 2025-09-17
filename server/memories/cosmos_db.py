from azure.cosmos import CosmosClient, PartitionKey
from django.conf import settings

class BaseCosmosDBManager:
    def __init__(self, container_name: str):
        self.client = CosmosClient(
            settings.COSMOS_DB_HOST,
            settings.COSMOS_DB_KEY
        )
        self.database = self.client.get_database_client(settings.COSMOS_DB_NAME)
        self.container = self.database.get_container_client(container_name)

    def create_item(self, item):
        return self.container.create_item(body=item)

    def get_item(self, id):
        return self.container.read_item(item=id, partition_key=id)


class MemoriesDBManager(BaseCosmosDBManager):
    def __init__(self):
        super().__init__(settings.COSMOS_MEMORIES_CONTAINER)

    def search_similar_memories(self, query_embedding, top_k=5):
        from .models import Memory  # local import to avoid circular dependency

        if top_k is None:
            top_k = getattr(settings, 'MEMORY_SEARCH_TOP_K_DEFAULT', 5)
        if not isinstance(top_k, int) or top_k <= 0:
            top_k = getattr(settings, 'MEMORY_SEARCH_TOP_K_DEFAULT', 5)

        query = f"""
        SELECT TOP {top_k}
            c.id,
            c.title,
            c.content,
            c.created_at,
            c.updated_at,
            c.embedding,
            VectorDistance(c.embedding, @query_vector) AS distance
        FROM c
        ORDER BY VectorDistance(c.embedding, @query_vector)
        """

        parameters = [{"name": "@query_vector", "value": query_embedding}]

        items = list(self.container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        results = []
        for item in items:
            distance = item.get("distance")
            similarity = 0.0 if distance is None else 1.0 / (1.0 + distance)
            memory = Memory.from_cosmos_item(item)
            results.append((memory, similarity))
        return results

class SummariesDBManager(BaseCosmosDBManager):
    def __init__(self):
        super().__init__(settings.COSMOS_SUMMARIES_CONTAINER)

    def upsert_item(self, item: dict):
        return self.container.upsert_item(item)    
