import uuid
from datetime import datetime
from .azure_openai import get_azure_openai

class Memory:
    def __init__(self, content, id=None, created_at=None, updated_at=None, embedding=None):
        self.id = id or str(uuid.uuid4())
        self.content = content
        self.created_at = created_at or datetime.utcnow().isoformat()
        self.updated_at = updated_at or datetime.utcnow().isoformat()
        self.embedding = embedding or self._generate_embedding()

    def _generate_embedding(self):
        """Generate embedding vector for the memory content"""
        # Use content directly now that title has been removed
        text = self.content
        return get_azure_openai().generate_embeddings(text)

    @classmethod
    def from_cosmos_item(cls, item):
        return cls(
            id=item.get('id'),
            content=item.get('content'),
            created_at=item.get('created_at'),
            updated_at=item.get('updated_at'),
            embedding=item.get('embedding')
        )

    def to_cosmos_item(self):
        return {
            'id': self.id,
            'content': self.content,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'embedding': self.embedding
        }
        
    def similarity_to(self, other_memory):
        """Calculate similarity with another memory"""
        return get_azure_openai().calculate_similarity(self.embedding, other_memory.embedding)
