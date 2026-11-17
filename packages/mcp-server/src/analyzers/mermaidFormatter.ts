import type { FlowGraphPayload, FlowNode } from "@flowguard/shared";

function escapeMermaidLabel(text: string): string {
  return text
    .replace(/\\/g, "/")
    .replace(/"/g, "'")
    .replace(/[[\]{}|;<>#`]/g, " ")
    .replace(/-->|-\.->|==>/g, "->")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function getCategoryClass(category: FlowNode["category"]): string {
  switch (category) {
    case "INPUT_GATE":
      return "inputGate";
    case "STATE_MACHINE":
      return "stateMachine";
    case "IMPLICIT_WARNING":
      return "implicitWarning";
    case "OUTPUT_GATE":
      return "outputGate";
  }
}

/**
 * Formats a FlowGraphPayload into a clean, harness-ready Mermaid `flowchart LR` diagram
 * grouped by file or explicit stage `group`.
 */
export function formatGraphAsMermaid(graph: FlowGraphPayload): string {
  if (graph.nodes.length === 0) {
    return "flowchart LR\n  empty[\"No flow nodes detected\"]";
  }

  const lines: string[] = ["flowchart LR"];
  const groups = new Map<string, FlowNode[]>();

  for (const node of graph.nodes) {
    const groupName = node.group || node.filePath;
    const list = groups.get(groupName) ?? [];
    list.push(node);
    groups.set(groupName, list);
  }

  let groupIdx = 0;
  for (const [groupName, nodes] of groups.entries()) {
    groupIdx++;
    const subId = `grp_${groupIdx}_${sanitizeMermaidId(groupName.split("/").pop() || "module")}`;
    lines.push(`  subgraph ${subId}["${escapeMermaidLabel(groupName)}"]`);
    for (const node of nodes) {
      const mId = sanitizeMermaidId(node.id);
      const loc = `${node.filePath.split("/").pop() ?? node.filePath}:${node.lineRange[0]}`;
      const detail = node.schemaOrType ? ` | ${node.schemaOrType.slice(0, 48)}` : "";
      const label = escapeMermaidLabel(`${node.label} (${loc})${detail}`);
      lines.push(`    ${mId}["${label}"]:::${getCategoryClass(node.category)}`);
    }
    lines.push("  end");
  }

  for (const edge of graph.edges) {
    const src = sanitizeMermaidId(edge.source);
    const tgt = sanitizeMermaidId(edge.target);
    const arrow = edge.isImplicitLeak ? "-.->" : "-->";
    if (edge.label) {
      lines.push(`  ${src} ${arrow}|"${escapeMermaidLabel(edge.label)}"| ${tgt}`);
    } else {
      lines.push(`  ${src} ${arrow} ${tgt}`);
    }
  }

  lines.push(
    "  classDef inputGate fill:#064e3b,stroke:#10b981,color:#ecfdf5",
    "  classDef stateMachine fill:#0c4a6e,stroke:#0ea5e9,color:#f0f9ff",
    "  classDef implicitWarning fill:#7f1d1d,stroke:#ef4444,stroke-dasharray: 5 5,color:#fef2f2",
    "  classDef outputGate fill:#4c1d95,stroke:#a855f7,color:#faf5ff"
  );

  return lines.join("\n");
}
