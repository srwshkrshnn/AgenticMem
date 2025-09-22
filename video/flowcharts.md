## Memory Extraction & Update Flow (Left-to-Right)

```mermaid
flowchart LR
    subgraph MSG[Messages]
        U[User Msgs] -->|conversation| AIAgent[Assistant Msgs]
    end

    MSG --> EP

    subgraph EP[Extraction Phase - LLM]
        direction TB
        SUM[Conversation Summary]
        LM[Last m messages]
        CURR[Current Turn]
        SUM --> LM --> CURR
    end

    SUMGEN[Summary Generator]

    EP -->|extracted candidate memories| CAND[New extracted memories]
    SUMGEN -->|provides summary| EP
    SUMGEN -->|fetch summary & past messages| DB[(Database)]

    CAND --> UP

    subgraph UP[Update Phase - LLM]
        direction TB
        TOPS[Top s similar memories] --> TOOL[Tool Call]
        TOOL --> ADDADD[ADD]
        TOOL --> UPD[UPDATE]
        TOOL --> DEL[DELETE]
        TOOL --> NOOP[NOOP]
    end

    DB -->|fetch similar memories| TOPS
    ADDADD --> NEW[New memories]
    UPD --> NEW
    DEL --> NEW
    NOOP --> NEW

    NEW -->|update memories| DB
    CAND -.-> SUMGEN

    classDef store fill:#f9e79f,stroke:#c39c0a,stroke-width:1px;
    classDef phase1 fill:#e8e3f6,stroke:#6c55a3,stroke-width:1px;
    classDef phase2 fill:#e6f5e6,stroke:#4a7a42,stroke-width:1px;
    classDef actionAdd fill:#7fbf7f,stroke:#2e662e,color:#fff;
    classDef actionUpd fill:#5a8fd8,stroke:#1d4e89,color:#fff;
    classDef actionDel fill:#c84d3c,stroke:#7a1f14,color:#fff;
    classDef actionNoop fill:#d8bfd8,stroke:#6a3e6a,color:#fff;

    class DB store;
    class EP phase1;
    class UP phase2;
    class ADDADD actionAdd;
    class UPD actionUpd;
    class DEL actionDel;
    class NOOP actionNoop;
```

Legend:
- Messages enter the Extraction Phase combining prior summary, last m messages, and current turn.
- Summary Generator retrieves existing summary & past messages from the database and can refresh the summary provided to the Extraction Phase.
- Extraction Phase emits candidate (new extracted) memories.
- Update Phase pulls top similar memories from the database, decides per candidate whether to ADD, UPDATE, DELETE, or NOOP, producing new memory states.
- Database is then updated with resulting memory operations.

