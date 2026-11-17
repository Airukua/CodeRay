import { serverState } from "../state.js";
import { getVisualizerUrl } from "../ws-server.js";

export const getUiSelectionInputSchema = {};

export async function handleGetUiSelection() {
  const selection = serverState.activeUiSelection;
  if (!selection) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            selected: false,
            visualizerUrl: getVisualizerUrl(),
            message:
              "No node or edge is currently selected in the Visualizer UI. Ask the user to click a node in the browser canvas.",
          }),
        },
      ],
    };
  }

  const node = selection.selectedNodeId
    ? serverState.currentGraph?.nodes.find((n) => n.id === selection.selectedNodeId)
    : undefined;

  const edge = selection.selectedEdgeId
    ? serverState.currentGraph?.edges.find((e) => e.id === selection.selectedEdgeId)
    : undefined;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            selected: true,
            selection,
            node,
            edge,
          },
          null,
          2
        ),
      },
    ],
  };
}
