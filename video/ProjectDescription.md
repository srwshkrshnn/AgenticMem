## Project: User-Owned Cross-Platform AI Memory Layer

### Vision
Build a user-owned, cross-platform memory layer for AI agents that seamlessly unifies personal data across applications.

### Description
This project explores building an interoperable memory layer that consolidates a user's memories in a single place so different AI agents can leverage richer context and produce better results. The design is inspired by existing systems such as Mem0, Zep, and LangMem.

### Memory Ingestion Methods
Memories are primarily created and updated through two complementary methods:

1. **Foreground (Real-Time Extension):** A browser extension observes user interactions on approved websites and updates relevant information immediately.
2. **Background (Periodic Sync):** Memories are periodically refreshed using APIs for user-specified applications.

### Storage Architecture
Different types of memories are persisted in specialized stores:

1. **Semantic & Contextual Memories:** Stored in Azure Cosmos DB and retrieved via vector search.
2. **Episodic & Procedural Memories:** Incrementally updated in a knowledge graph using Graphiti and Neo4j.

Both stores are queried when contextualization is required, and their results can be merged or ranked for downstream agent workflows.

### Market Opportunity
The potential addressable market for a robust, privacy-respecting memory layer is significant. Publicly available figures indicate:

- Agentic AI market size: $5.25B in 2024, projected to reach $199B by 2034.
- Orchestration & memory systems market: $6.27B in 2025, projected to reach $28.45B by 2030.
- ChatGPT alone has an estimated 400–800M weekly active users and processes ~2.5B prompts daily.
- Memory-enabled systems' DAU could reach tens of millions globally.
- Enterprise adoption is accelerating for compliance, auditability, and efficiency.

### Rationale
Current AI assistants lack persistent, structured, and user-controlled long-term context. A unified, portable memory layer can:

- Reduce redundant prompting and repeated user input.
- Enable personalization across heterogeneous agents and tools.
- Improve retrieval quality by combining semantic embeddings with graph-linked episodic structure.
- Support explainability and traceability of agent behavior.

### References
1. [Mem0](https://arxiv.org/abs/2504.19413)
2. [Zep](https://arxiv.org/abs/2501.13956)
3. [LangMem Core Concepts](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)

---
_Draft document – subject to iteration as architecture and product scope evolve._
