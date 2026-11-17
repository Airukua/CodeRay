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

const server = new McpServer({
  name: "coderay-mcp",
  version: "0.1.0",
});

server.registerTool(
  "scan_data_flow",
  {
    description:
      "Scan TypeScript/React/Next.js and Python files using deterministic AST analysis, extract Input Gate -> State Machine / Implicit Warning -> Output Gate, and return a concise summary with an optional Mermaid flowchart LR diagram for the agent harness.",
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[CodeRay] Headless MCP Server connected via stdio");
}

main().catch((error) => {
  console.error("[CodeRay] Fatal error:", error);
  process.exit(1);
});
