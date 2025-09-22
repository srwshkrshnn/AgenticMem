Pensieve – 2 Minute Hackathon Demo Script

TOTAL TARGET: ~2:00 (≈285 words)

0:00 – 0:10  COLD OPEN / PROBLEM HOOK
VISUAL: Split screen – user asks different LLM/chat apps the same personal scheduling question. Each gives an incomplete answer.
NARRATOR (energized): "Ever notice how every AI agent you use forgets who you are the moment you close the tab? Your context is scattered and vendor locked."

0:10 – 0:25  PROBLEM STATEMENT
VISUAL: Logos (ChatGPT, Teams, Slack, Email, OneNote, OneDrive, Notion) floating in isolated bubbles.
NARRATOR: "Today’s LLM agents don’t actually know you — they only peek at the narrow slice of data you surrender to that platform. Your memory is fragmented and none of it is truly yours."

0:25 – 0:40  INTRODUCING PENSIEVE
VISUAL: Bubbles converge into one secure personal vault icon labeled Pensieve.
NARRATOR: "Meet Pensieve. Your portable, user‑owned memory layer for AI. Pensieve unifies your interactions and knowledge across platforms, so any agent you authorize can finally act with real context — your context."

0:40 – 1:05  HOW IT BUILDS MEMORY
VISUAL: Demo of extension filling context in ChatGPT, Demo of magic cue in Teams
NARRATOR: "In the foreground, the browser extension observes approved moments turning them into structured memories. In the background, connected data sources periodically enrich that knowledge graph.

(CosmosDB)
Semantic and Contextual memories are stored in the Cosmos DB vector database for fast recall. Based on recent context, existing memories can be updated, deleted or added to the vector index.

(Graphiti)
For episodic or procedural memories, a knowledge graph, maintained using Graphiti and Neo4j, is incrementally updated. Each node is an entity and edges represent relationships. As newer context arrives, the graph is accordingly updated to reflect new information.

When needed, memories are extracted using vector search and nearest neighbor techniques to find relevant prior context.

This approach offers several advantages compared to trational methods. Retrieval is faster, cost is lower and recall is higher.

1:35 – 1:50  MAGIC MOMENT
VISUAL: ChatGPT memory fetch, Teams Magic cue
NARRATOR: "These memories can then be surfaced at relevant surfaces to provide richer, more personalized AI experiences."

1:50 – 2:00  DASHBOARD & CONTROL (CALL TO ACTION)
NARRATOR: "All of this happens with complete user ownership. In the dashboard you can view, edit, delete memories, and toggle or revoke any source — ingestion stops instantly. Delete a memory and it’s truly gone: purged from the vector index and the graph, not just hidden."

Pensieve: Unified Memory. Truly Yours.

ON SCREEN TEXT (final frame): "Pensieve – Your Memory. Your Context. Your Agents."  (QR / URL)

TODOs:
- [ ] Add a clip of memory being built by browser interactions
- [ ] On Dashboard add feature to spot ingestion or both stop ingestion and delete all memories from a source