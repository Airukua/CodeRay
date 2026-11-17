import path from "node:path";
import { z } from "zod";
import { NodeCategorySchema, type NodeCategory } from "@flowguard/shared";
import { buildFlowGraph } from "../analyzers/graphBuilder.js";
import { computeGraphDiff } from "../analyzers/graphDiff.js";
import { resolveOneHopImports } from "../analyzers/importResolver.js";
import { serverState, updateGraphState } from "../state.js";
import { resolveSandboxedPaths } from "../utils/pathGuard.js";

const DEFAULT_NODE_LIMIT = 50;

export const scanFlowInputSchema = {
  filePaths: z
    .array(z.string())
    .min(1)
    .describe("Targeted file or directory paths (.ts, .tsx, .py) to scan"),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional absolute workspace root directory (useful when MCP server cwd differs from active project)"),
  categories: z
    .array(NodeCategorySchema)
    .optional()
    .describe("Optional category filter (e.g. ['INPUT_GATE', 'IMPLICIT_WARNING']) to minimize token output"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Max nodes to include in nodeIds output (defaults to 50; full graph stays cached for inspect_node_contract)"),
  includeDiff: z
    .boolean()
    .optional()
    .describe("Compare against the previous scanned graph and return added/modified/removed items"),
  followLocalImports: z
    .boolean()
    .optional()
    .describe("Automatically include 1-hop local imports from the specified files"),
};

export async function handleScanDataFlow(args: {
  filePaths: string[];
  projectRoot?: string;
  categories?: NodeCategory[];
  limit?: number;
  includeDiff?: boolean;
  followLocalImports?: boolean;
}) {
  if (args.projectRoot) {
    serverState.projectRoot = path.resolve(args.projectRoot);
  }

  const { valid, rejected } = await resolveSandboxedPaths(
    args.filePaths,
    serverState.projectRoot
  );

  if (valid.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "No valid file paths within projectRoot.",
            rejected,
            projectRoot: serverState.projectRoot,
          }),
        },
      ],
    };
  }

  const targetFiles = args.followLocalImports
    ? await resolveOneHopImports(valid, serverState.projectRoot)
    : valid;

  const rawGraph = await buildFlowGraph(targetFiles, serverState.projectRoot);
  const { diff, annotatedGraph } = args.includeDiff
    ? computeGraphDiff(serverState.currentGraph, rawGraph)
    : { diff: undefined, annotatedGraph: rawGraph };

  updateGraphState(annotatedGraph);

  const implicitWarnings = annotatedGraph.nodes
    .filter((n) => n.category === "IMPLICIT_WARNING")
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      filePath: n.filePath,
      lineRange: n.lineRange,
      warning: n.metadata?.warningMessage,
    }));

  const categoryFilter = args.categories ? new Set(args.categories) : null;
  const filteredNodes = categoryFilter
    ? annotatedGraph.nodes.filter((n) => categoryFilter.has(n.category))
    : annotatedGraph.nodes;
  const maxNodes = args.limit ?? DEFAULT_NODE_LIMIT;
  const slicedNodes = filteredNodes.slice(0, maxNodes);

  const summary = {
    scannedFilesCount: targetFiles.length,
    counts: {
      inputGates: annotatedGraph.nodes.filter((n) => n.category === "INPUT_GATE").length,
      stateMachines: annotatedGraph.nodes.filter((n) => n.category === "STATE_MACHINE").length,
      implicitWarnings: implicitWarnings.length,
      outputGates: annotatedGraph.nodes.filter((n) => n.category === "OUTPUT_GATE").length,
      edges: annotatedGraph.edges.length,
    },
    implicitWarnings,
    nodeIds: slicedNodes.map((n) => ({
      id: n.id,
      category: n.category,
      label: n.label,
    })),
    ...(filteredNodes.length > slicedNodes.length
      ? { truncatedNodes: filteredNodes.length - slicedNodes.length }
      : {}),
    ...(diff ? { diff } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(summary),
      },
    ],
  };
}
