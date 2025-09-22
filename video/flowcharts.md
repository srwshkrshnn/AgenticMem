# Memory Extraction & Update Flow with CosmosDB

```mermaid
flowchart LR
    MSG[New events or information]

    MSG --> EP

    subgraph EP[Extraction Phase - LLM]
        SUM[Conversation Summary]
        LM[Last m events]
        CURR[Current Turn]
        SUM ~~~ LM ~~~ CURR
    end

    SUMGEN[Summary Generator]

    EP -->|extracted candidate<br/>memories| CAND[New extracted memories]
    SUMGEN -->|update summary & past events| SUMDB[(Summary Database)]
    EP --> SUMGEN

    SUMDB -->|Summaries and last m events| EP

    CAND --> UP

    subgraph UP[Update Phase - LLM]
        direction TB
        TOPS[Top s similar memories] --> TOOL[Tool Call]
        TOOL --> ADDADD[ADD]
        TOOL --> UPD[UPDATE]
        TOOL --> DEL[DELETE]
        TOOL --> NOOP[NOOP]
    end

    MEMDB[(Memory Database)] -->|fetch similar memories| TOPS
    ADDADD --> MEMDB
    UPD --> MEMDB
    DEL --> MEMDB
    NOOP --> MEMDB


    classDef store fill:#f9e79f,stroke:#c39c0a,stroke-width:1px;
    classDef phase1 fill:#e8e3f6,stroke:#6c55a3,stroke-width:1px;
    classDef phase2 fill:#e6f5e6,stroke:#4a7a42,stroke-width:1px;
    classDef actionAdd fill:#7fbf7f,stroke:#2e662e,color:#fff;
    classDef actionUpd fill:#5a8fd8,stroke:#1d4e89,color:#fff;
    classDef actionDel fill:#c84d3c,stroke:#7a1f14,color:#fff;
    classDef actionNoop fill:#d8bfd8,stroke:#6a3e6a,color:#fff;

    class MEMDB,SUMDB store;
    class EP phase1;
    class UP phase2;
    class ADDADD actionAdd;
    class UPD actionUpd;
    class DEL actionDel;
    class NOOP actionNoop;
```

Legend:
- Events enter the Extraction Phase combining prior summary, last m events, and current turn.
- Summary Generator retrieves existing summary & past events from the Summary Database and can refresh the summary provided to the Extraction Phase.
- Extraction Phase emits candidate (new extracted) memories.
- Update Phase pulls top similar memories from the Memory Database, decides per candidate whether to ADD, UPDATE, DELETE, or NOOP, producing new memory states.
- Memory Database is then updated with resulting memory operations.

## Graphiti with Neo4j Internal Memory Update Flow

```mermaid
flowchart LR
    MSG[New events or information]

    MSG --> EP

    subgraph EP[Extraction Phase - Graphiti]
        SUM[Context Summary]
        FACTS[Extracted Facts]
        ENT[Entity Extraction]
        REL[Relationship Detection]
        SUM --> FACTS --> ENT --> REL
    end

    EP -->|extracted entities<br/>and relationships| CAND[Candidate Graph Updates]

    CAND --> UP

    subgraph UP[Update Phase - Graphiti Engine]
        direction TB
        SEARCH[Vector Similarity Search on identified nodes]
        MERGE[Entity/Relationship Merging]
        CONFLICT[Conflict Resolution]
        TEMPORAL[Temporal Conflict Resolution]
        SEARCH --> MERGE --> CONFLICT --> TEMPORAL
    end

    subgraph NEO4J[Neo4j Graph Database]
        NODES[(Entity Nodes)]
        EDGES[(Relationship Edges)]
        VECTORS[(Vector Embeddings)]
        NODES -.-> EDGES
        NODES -.-> VECTORS
    end

    NEO4J -->|fetch similar entities/relationships| SEARCH
    TEMPORAL --> FINAL[Final Graph Operations]
    
    FINAL --> NEO4J_OPS

    subgraph NEO4J_OPS[Neo4j Operations]
        CREATE_NODE[CREATE Node]
        UPDATE_NODE[UPDATE Node]
        CREATE_REL[CREATE Relationship]
        UPDATE_REL[UPDATE Relationship]
        DELETE_NODE[DELETE Node]
        INVALIDATE_REL[INVALIDATE Relationship]
        CREATE_NODE~~~UPDATE_NODE~~~CREATE_REL~~~UPDATE_REL~~~DELETE_NODE~~~INVALIDATE_REL
    end

    NEO4J_OPS --> NEO4J

    classDef store fill:#f9e79f,stroke:#c39c0a,stroke-width:1px;
    classDef phase1 fill:#e8e3f6,stroke:#6c55a3,stroke-width:1px;
    classDef phase2 fill:#e6f5e6,stroke:#4a7a42,stroke-width:1px;
    classDef neo4j fill:#87ceeb,stroke:#4682b4,stroke-width:2px;
    classDef operations fill:#ffd700,stroke:#daa520,stroke-width:1px;
    classDef createOp fill:#90ee90,stroke:#228b22,color:#000;
    classDef updateOp fill:#87cefa,stroke:#4169e1,color:#000;
    classDef deleteOp fill:#ffa07a,stroke:#ff4500,color:#000;

    class NEO4J,NODES,EDGES,VECTORS neo4j;
    class EP phase1;
    class UP phase2;
    class NEO4J_OPS operations;
    class CREATE_NODE,CREATE_REL createOp;
    class UPDATE_NODE,UPDATE_REL updateOp;
    class DELETE_NODE,INVALIDATE_REL deleteOp;
```

Graphiti-Neo4j Legend:

- Events are processed by Graphiti's extraction phase to identify entities, relationships, facts, and temporal context
- Temporal resolution ensures proper time-based ordering and conflict detection
- Vector similarity search finds existing similar entities and relationships in Neo4j
- Graphiti's merging engine resolves conflicts and determines optimal graph structure with temporal awareness
- Temporal conflict resolution handles time-based inconsistencies and updates
- Final operations are executed as Cypher queries against the Neo4j graph database
- Neo4j stores entities as nodes, relationships as edges, and maintains vector embeddings for similarity search

## Hybrid Retrieval Flow (Semantic + BM25 + Graph Traversal)

```mermaid
flowchart LR
    Q[Query]


    subgraph RET[Graphiti Retrieval Engine]
        NEXT[Node Extraction]
        SEM[Semantic Search]
        KEY[Keyword Search]
        TRAV[Sub-Graph Traversal<br/>Starting from identified<br/>nodes]
        
        NEXT --> SEM
        NEXT --> KEY
        SEM --> TRAV
        KEY --> TRAV
        TRAV --> FUSE[Result Fusion<br/>Semantic + Keyword + Graph]
    end

    subgraph EXT[Cosmos DB Extraction]
        QEXT[Query Extraction]
        VSEARCH[Vector Search]
        FILTER[Relevance Filter]
        QEXT --> VSEARCH --> FILTER
    end

    EXTRACT[Extracted Memories]

    subgraph NEO4J[Neo4j Graph Database]
        NODES[(Entity Nodes)]
        EDGES[(Relationship Edges)]
        VECTORS[(Vector Embeddings)]
        NODES -.-> EDGES
        NODES -.-> VECTORS
    end

    MEMDB[(Memories Database)]

    Q --> NEXT
    Q --> QEXT

    NEO4J <--> RET
    VSEARCH --> MEMDB
    FILTER --> EXTRACT
    
    FUSE --> RES[Extracted Memories]
    
    RES --> MERGE[Memory Merge]
    EXTRACT --> MERGE
    
    MERGE --> FINAL[Final Merged Memories]

    classDef store fill:#f9e79f,stroke:#c39c0a,stroke-width:1px;
    classDef phase1 fill:#e8e3f6,stroke:#6c55a3,stroke-width:1px;
    classDef phase2 fill:#e6f5e6,stroke:#4a7a42,stroke-width:1px;
    classDef neo4j fill:#87ceeb,stroke:#4682b4,stroke-width:2px;
    classDef merge fill:#ffb6c1,stroke:#dc143c,stroke-width:2px;

    class NEO4J,NODES,EDGES,VECTORS neo4j;
    class MEMDB store;
    class RET phase2;
    class EXT phase1;
    class MERGE,FINAL merge;
```

