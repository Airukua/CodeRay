import { z } from "zod";
import { serverState } from "../state.js";

export const inspectNodeInputSchema = {
  nodeId: z.string().min(1).describe("The FlowNode ID to inspect from the latest scan"),
};

export async function handleInspectNodeContract(args: { nodeId: string }) {
  const graph = serverState.currentGraph;
  if (!graph) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "No graph scanned yet. Run scan_data_flow first.",
          }),
        },
      ],
    };
  }

  const node = graph.nodes.find((n) => n.id === args.nodeId);
  if (!node) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Node '${args.nodeId}' not found in current graph.`,
            availableNodeIds: graph.nodes.map((n) => n.id),
          }),
        },
      ],
    };
  }

  const incomingEdges = graph.edges.filter((e) => e.target === node.id);
  const outgoingEdges = graph.edges.filter((e) => e.source === node.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            node,
            incomingEdges,
            outgoingEdges,
          },
          null,
          2
        ),
      },
    ],
  };
}
