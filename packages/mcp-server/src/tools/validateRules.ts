import path from "node:path";
import { z } from "zod";
import type { ArchitectureViolation } from "@flowguard/shared";
import { buildFlowGraph } from "../analyzers/graphBuilder.js";
import { detectContractMismatches } from "../analyzers/contractMatcher.js";
import { serverState } from "../state.js";
import { resolveSandboxedPaths } from "../utils/pathGuard.js";

export const validateRulesInputSchema = {
  filePaths: z
    .array(z.string())
    .min(1)
    .describe("Files or directories to validate against CodeRay architecture rules"),
  projectRoot: z
    .string()
    .optional()
    .describe("Optional absolute workspace root directory"),
  strictMode: z
    .boolean()
    .optional()
    .describe("Treat all implicit state warnings as errors when true"),
};

export async function handleValidateArchitectureRules(args: {
  filePaths: string[];
  projectRoot?: string;
  strictMode?: boolean;
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
          }),
        },
      ],
    };
  }

  const graph = await buildFlowGraph(valid, serverState.projectRoot);
  const violations: ArchitectureViolation[] = [];

  for (const node of graph.nodes) {
    if (node.category === "IMPLICIT_WARNING") {
      violations.push({
        severity: args.strictMode ? "error" : "warning",
        ruleId: "IMPLICIT_STATE_LEAK",
        nodeId: node.id,
        filePath: node.filePath,
        lineRange: node.lineRange,
        message:
          node.metadata?.warningMessage ??
          `Implicit state detected at ${node.label}`,
        suggestion:
          "Pass dependencies explicitly via the Input Gate (function parameters / props / validated config) instead of reading or mutating hidden/global state.",
      });
    }
  }

  violations.push(...detectContractMismatches(graph));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            passed: violations.filter((v) => v.severity === "error").length === 0,
            strictMode: Boolean(args.strictMode),
            totalViolations: violations.length,
            violations,
          },
          null,
          2
        ),
      },
    ],
  };
}
