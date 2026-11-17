import path from "node:path";
import { z } from "zod";
import {
  FlowEdgeSchema,
  FlowNodeSchema,
  type FlowEdge,
  type FlowGraphPayload,
  type FlowNode,
} from "@flowguard/shared";
import { serverState, updateGraphState } from "../state.js";
import { broadcastGraphUpdate, getVisualizerUrl } from "../ws-server.js";

export const publishFlowStoryInputSchema = {
  storyTitle: z
    .string()
    .min(1)
    .describe("Short title describing the end-to-end user-to-output data journey"),
  storySummary: z
    .string()
    .optional()
    .describe("1-2 sentence summary explaining the overall flow and key implicit state risks"),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional absolute workspace root directory"),
  nodes: z
    .array(FlowNodeSchema)
    .min(1)
    .describe(
      "Ordered story nodes from user trigger/request -> INPUT_GATE (include inputFormat & description) -> STATE_MACHINE / IMPLICIT_WARNING -> OUTPUT_GATE"
    ),
  edges: z
    .array(FlowEdgeSchema)
    .describe("Edges connecting the story nodes with clear payload/action labels"),
};

export async function handlePublishFlowStory(args: {
  storyTitle: string;
  storySummary?: string;
  projectRoot?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  if (args.projectRoot) {
    serverState.projectRoot = path.resolve(args.projectRoot);
  }

  const payload: FlowGraphPayload = {
    timestamp: new Date().toISOString(),
    projectRoot: serverState.projectRoot,
    storyTitle: args.storyTitle,
    storySummary: args.storySummary,
    nodes: args.nodes,
    edges: args.edges,
  };

  updateGraphState(payload);
  broadcastGraphUpdate(payload);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            published: true,
            visualizerUrl: getVisualizerUrl(),
            storyTitle: payload.storyTitle,
            counts: {
              nodes: payload.nodes.length,
              edges: payload.edges.length,
              implicitWarnings: payload.nodes.filter((n) => n.category === "IMPLICIT_WARNING")
                .length,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
