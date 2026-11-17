import path from "node:path";
import { z } from "zod";
import { buildFlowGraph } from "../analyzers/graphBuilder.js";
import { computeGraphDiff } from "../analyzers/graphDiff.js";
import { resolveOneHopImports } from "../analyzers/importResolver.js";
import { formatGraphAsMermaid } from "../analyzers/mermaidFormatter.js";
import { serverState, updateGraphState } from "../state.js";
import { resolveSandboxedPaths } from "../utils/pathGuard.js";

export const scanFlowInputSchema = {
  filePaths: z
    .array(z.string())
    .min(1)
    .describe("File or directory paths (.ts, .tsx, .py) to scan"),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional absolute workspace root directory (useful when MCP server cwd differs from active project)"),
  includeDiff: z
    .boolean()
    .optional()
    .describe("Compare against the previous scanned graph and return added/modified/removed items"),
  followLocalImports: z
    .boolean()
    .optional()
    .describe("Automatically include 1-hop local imports from the specified files"),
  includeMermaid: z
    .boolean()
    .optional()
    .describe("Include a ready-to-render Mermaid flowchart LR diagram (defaults to true)"),
};

export async function handleScanDataFlow(args: {
  filePaths: string[];
  projectRoot?: string;
  includeDiff?: boolean;
  followLocalImports?: boolean;
  includeMermaid?: boolean;
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

  const includeMermaid = args.includeMermaid !== false;

  const summary = {
    scannedFilesCount: targetFiles.length,
    counts: {
      inputGates: annotatedGraph.nodes.filter((n) => n.category === "INPUT_GATE").length,
      stateMachines: annotatedGraph.nodes.filter((n) => n.category === "STATE_MACHINE").length,
      implicitWarnings: implicitWarnings.length,
      outputGates: annotatedGraph.nodes.filter((n) => n.category === "OUTPUT_GATE").length,
      edges: annotatedGraph.edges.length,
    },
    renderHint:
      "Present a clean Mermaid flowchart LR diagram in your final response (using the mermaid field below or synthesizing an end-to-end flow from these findings).",
    ...(includeMermaid ? { mermaid: formatGraphAsMermaid(annotatedGraph) } : {}),
    implicitWarnings,
    nodeIds: annotatedGraph.nodes.map((n) => ({
      id: n.id,
      category: n.category,
      label: n.label,
    })),
    ...(diff ? { diff } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}
