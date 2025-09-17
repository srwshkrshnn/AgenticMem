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

    def search_similar_memories(self, query_embedding, top_k=None):
        """Perform a vector similarity search in Cosmos DB.

        Requires a vector index on the `embedding` field.

        Args:
            query_embedding (list[float]): Embedding vector of the query.
            top_k (int): Max number of similar memories to return.

        Returns:
            list[tuple[Memory, float]]: (Memory, similarity_score) pairs sorted by similarity.
        """
        from .models import Memory  # Local import to avoid circular dependency

        from django.conf import settings as django_settings
        if top_k is None:
            top_k = getattr(django_settings, 'MEMORY_SEARCH_TOP_K_DEFAULT', 5)
        if not isinstance(top_k, int) or top_k <= 0:
            top_k = getattr(django_settings, 'MEMORY_SEARCH_TOP_K_DEFAULT', 5)

        query = f"""
        SELECT TOP {top_k}
            c.id,
            c.user_id,
            c.title,
            c.content,
            c.embedding,
            VectorDistance(c.embedding, @query_vector) AS distance
        FROM c
        ORDER BY VectorDistance(c.embedding, @query_vector)
        """

        parameters = [{"name": "@query_vector", "value": query_embedding}]

        items = list(
            self.container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            )
        )

        results = []
        for item in items:
            memory = Memory.from_cosmos_item(item)
            distance = item.get("distance")
            similarity = 0.0 if distance is None else 1.0 / (1.0 + distance)
            results.append((memory, similarity))

        return results

cosmos_db = CosmosDBManager()