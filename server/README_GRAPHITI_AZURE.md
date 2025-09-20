Using Graphiti with Azure OpenAI
Graphiti supports Azure OpenAI for both LLM inference and embeddings. Azure deployments often require different endpoints for LLM and embedding services, and separate deployments for default and small models.

Important

Azure OpenAI v1 API Opt-in Required for Structured Outputs

Graphiti uses structured outputs via the client.beta.chat.completions.parse() method, which requires Azure OpenAI deployments to opt into the v1 API. Without this opt-in, you'll encounter 404 Resource not found errors during episode ingestion.

To enable v1 API support in your Azure OpenAI deployment, follow Microsoft's guide: Azure OpenAI API version lifecycle.

from openai import AsyncAzureOpenAI
from graphiti_core import Graphiti
from graphiti_core.llm_client import LLMConfig, OpenAIClient
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient

# Azure OpenAI configuration - use separate endpoints for different services
api_key = "<your-api-key>"
api_version = "<your-api-version>"
llm_endpoint = "<your-llm-endpoint>"  # e.g., "https://your-llm-resource.openai.azure.com/"
embedding_endpoint = "<your-embedding-endpoint>"  # e.g., "https://your-embedding-resource.openai.azure.com/"

# Create separate Azure OpenAI clients for different services
llm_client_azure = AsyncAzureOpenAI(
    api_key=api_key,
    api_version=api_version,
    azure_endpoint=llm_endpoint
)

embedding_client_azure = AsyncAzureOpenAI(
    api_key=api_key,
    api_version=api_version,
    azure_endpoint=embedding_endpoint
)

# Create LLM Config with your Azure deployment names
azure_llm_config = LLMConfig(
    small_model="gpt-4.1-nano",
    model="gpt-4.1-mini",
)

# Initialize Graphiti with Azure OpenAI clients
graphiti = Graphiti(
    "bolt://localhost:7687",
    "neo4j",
    "password",
    llm_client=OpenAIClient(
        config=azure_llm_config,
        client=llm_client_azure
    ),
    embedder=OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            embedding_model="text-embedding-3-small-deployment"  # Your Azure embedding deployment name
        ),
        client=embedding_client_azure
    ),
    cross_encoder=OpenAIRerankerClient(
        config=LLMConfig(
            model=azure_llm_config.small_model  # Use small model for reranking
        ),
        client=llm_client_azure
    )
)

# Now you can use Graphiti with Azure OpenAI
Make sure to replace the placeholder values with your actual Azure OpenAI credentials and deployment names that match your Azure OpenAI service configuration.

