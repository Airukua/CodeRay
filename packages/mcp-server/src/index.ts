#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  handleScanDataFlow,
  scanFlowInputSchema,
} from "./tools/scanFlow.js";
import {
  handleInspectNodeContract,
  inspectNodeInputSchema,
} from "./tools/inspectNode.js";
import {
  handleValidateArchitectureRules,
  validateRulesInputSchema,
} from "./tools/validateRules.js";
import {
  getUiSelectionInputSchema,
  handleGetUiSelection,
} from "./tools/getUiSelection.js";
import { startVisualizerServer } from "./ws-server.js";

const server = new McpServer({
  name: "coderay-mcp",
  version: "0.1.0",
});

server.registerTool(
  "scan_data_flow",
  {
    description:
      "Scan TypeScript/React/Next.js and Python files using deterministic AST analysis, extract Input Gate -> State Machine / Implicit Warning -> Output Gate, push the graph to the local Visualizer UI via WebSocket, and return a concise summary (with optional diff and 1-hop local import tracing).",
    inputSchema: scanFlowInputSchema,
  },
  handleScanDataFlow
);

server.registerTool(
  "inspect_node_contract",
  {
    description:
      "Inspect full details of a specific FlowNode (source code snippet, line range, schema/type contract, and incoming/outgoing edges) from the latest scan_data_flow result.",
    inputSchema: inspectNodeInputSchema,
  },
  handleInspectNodeContract
);

server.registerTool(
  "validate_architecture_rules",
  {
    description:
      "Audit target files for implicit state leaks (process.env, global, mutable defaults, module-level mutations, useEffect without deps) and cross-boundary contract mismatches (frontend fetch payload vs backend Pydantic/Zod schema).",
    inputSchema: validateRulesInputSchema,
  },
  handleValidateArchitectureRules
);

server.registerTool(
  "get_ui_selection",
  {
    description:
      "Get the currently selected node or edge (and optional user note) clicked by the human developer in the local FlowGuard Visualizer UI.",
    inputSchema: getUiSelectionInputSchema,
  },
  handleGetUiSelection
);

async function main(): Promise<void> {
  await startVisualizerServer(4123);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[FlowGuard] MCP Server connected via stdio");
}

main().catch((error) => {
  console.error("[FlowGuard] Fatal error:", error);
  process.exit(1);
});
