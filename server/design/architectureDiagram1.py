"""Generate the system architecture diagram for the memory layer using Graphviz.

Outputs: architecture_diagram.png (and the .gv source) in the current working directory.
Run: python architectureDiagram1.py
"""

from graphviz import Digraph
from pathlib import Path
import os
import shutil
import sys


def ensure_graphviz() -> None:
    """Validate that the Graphviz 'dot' executable is available.

    Honors an optional environment variable GRAPHVIZ_BIN pointing to the Graphviz bin directory.
    Raises a clear RuntimeError with remediation steps if not found.
    """
    custom_bin = os.environ.get("GRAPHVIZ_BIN")
    if custom_bin:
        # Prepend custom bin to PATH for this process
        os.environ["PATH"] = f"{custom_bin}{os.pathsep}" + os.environ.get("PATH", "")

    if shutil.which("dot") is None:
        raise RuntimeError(
            "Graphviz 'dot' executable not found on PATH.\n"
            "Remediation steps:\n"
            "  1. Install Graphviz from https://graphviz.org/download/ (choose Windows installer).\n"
            "  2. Ensure the 'bin' directory (e.g. C\\\Program Files\\Graphviz\\bin) is added to PATH.\n"
            "  3. Open a NEW terminal after modifying PATH.\n"
            "  4. (Optional) Set GRAPHVIZ_BIN env var to the bin directory and re-run.\n"
            "Verification: run 'dot -V' in the same terminal."
        )


def build_diagram(
    rankdir: str = "TB",
    fontname: str = "Helvetica",
    base_fontsize: str = "12",
    node_fontsize: str = "14",
    title_fontsize: str = "18",
    bgcolor: str = "white",
    dpi: int = 180,
) -> Digraph:
    """Create and return the Digraph object representing the architecture."""
    dot = Digraph("MemoryLayerArchitecture", format="png")
    # Remove hard size constraint; rely on scaling / DPI
    dot.attr(
        rankdir=rankdir,
        fontname=fontname,
        fontsize=base_fontsize,
        label="Memory Layer Architecture",
        labelloc="t",
        bgcolor=bgcolor,
        dpi=str(dpi),
    )
    # Global node/edge styling
    dot.attr("node", shape="rect", style="rounded,filled", fillcolor="#f5f7fa", color="#44546a", fontname=fontname, fontsize=node_fontsize, margin="0.25,0.15")
    dot.attr("edge", color="#555555", arrowsize="0.8", fontname=fontname, fontsize=base_fontsize)

    # Ingestion Layer
    dot.node(
        "Ingestion",
        "Ingestion Layer\nSources: Agents / Apps / Devices\n• Normalize Data\n• Generate Embeddings\n• Enrich Metadata",
    )

    # Storage Layer split into Graph DB and Vector DB
    dot.node(
        "GraphDB",
        "Graph DB (Neo4j / Graphiti)\n• Entities & Relationships\n• Workflows / Dependencies\n• Provenance / Permissions",
    )
    dot.node(
        "VectorDB",
        "Vector DB (Cosmos DB + Extensions)\n• Multimodal Embeddings\n• Semantic Indexes\n• Fast Context Recall",
    )

    # Retrieval Layer
    dot.node(
        "Retrieval",
        "Hybrid Retrieval & Reasoning\n1. Semantic Search\n2. Graph Traversal\n3. Fusion & Ranking",
    )

    # Access Layer
    dot.node(
        "Access",
        "Access & Control Layer\n• User Ownership\n• Permission Graph\n• Portable Sharing",
    )

    # Agent Interface
    dot.node(
        "Agents",
        "AI Agents & Apps\n• Assistants\n• Productivity Tools\n• Chat / LLM Interfaces",
    )

    # Memory Types Cluster
    with dot.subgraph(name="cluster_memory") as c:
        c.attr(label="Memory Types Mapping", style="dashed", bgcolor="#ffffff", fontname=fontname, fontsize=title_fontsize)
        c.node("Episodic", "Episodic\nGraph + Vector")
        c.node("Semantic", "Semantic\nVector + Graph")
        c.node("Procedural", "Procedural\nGraph + Vector")
        c.node("Relational", "Relational\nGraph")
        c.node("Contextual", "Contextual\nVector")
        c.node("Emotional", "Emotional\nVector + Graph")
        c.node("Spatial", "Spatial / Temporal\nGraph + Vector")
        c.node("Meta", "Meta-Memory\nGraph")

    # Connect layers
    dot.edge("Ingestion", "GraphDB")
    dot.edge("Ingestion", "VectorDB")
    dot.edge("GraphDB", "Retrieval")
    dot.edge("VectorDB", "Retrieval")
    dot.edge("Retrieval", "Access")
    dot.edge("Access", "Agents")

    # Connect memory types to storage
    dotted = {"style": "dotted"}
    dot.edge("GraphDB", "Episodic", **dotted)
    dot.edge("VectorDB", "Episodic", **dotted)
    dot.edge("VectorDB", "Semantic", **dotted)
    dot.edge("GraphDB", "Semantic", **dotted)
    dot.edge("GraphDB", "Procedural", **dotted)
    dot.edge("VectorDB", "Procedural", **dotted)
    dot.edge("GraphDB", "Relational", **dotted)
    dot.edge("VectorDB", "Contextual", **dotted)
    dot.edge("VectorDB", "Emotional", **dotted)
    dot.edge("GraphDB", "Emotional", **dotted)
    dot.edge("GraphDB", "Spatial", **dotted)
    dot.edge("VectorDB", "Spatial", **dotted)
    dot.edge("GraphDB", "Meta", **dotted)
    return dot


def render_diagram(output_stem: str = "architecture_diagram", formats=("svg",)) -> list[Path]:
    """Render the diagram (default SVG only) and return list of paths.

    SVG is preferred for readability and infinite zoom. Provide additional formats by passing
    a tuple to 'formats'. Example: render_diagram(formats=("svg","png"))
    """
    ensure_graphviz()
    dot = build_diagram()
    outputs: list[Path] = []
    for fmt in formats:
        dot.format = fmt
        out_path = Path(dot.render(output_stem))
        final_path = out_path.with_suffix(f".{fmt}")
        outputs.append(final_path)
    return outputs


if __name__ == "__main__":
    generated = render_diagram()
    print("Generated SVG diagram:")
    for p in generated:
        size_kb = p.stat().st_size / 1024
        print(f" - {p} ({size_kb:.1f} KB)")
    print("\nTo produce a PNG as well: from architectureDiagram1 import render_diagram; render_diagram(formats=(\"svg\", \"png\"))")
