import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { detectLanguage } from "../analyzers/astEngine.js";
import { detectContractMismatches } from "../analyzers/contractMatcher.js";
import { buildFlowGraphFromSources, type SourceEntry } from "../analyzers/graphBuilder.js";
import { computeGraphDiff } from "../analyzers/graphDiff.js";
import {
  analyzeSlopWarnings,
  detectTestTampering,
  isTestFilePath,
  type SlopWarning,
  type TestTamperFinding,
} from "../analyzers/qualityAndTamperAnalyzer.js";
import { serverState } from "../state.js";
import { MAX_FILE_BYTES, resolveSandboxedPaths } from "../utils/pathGuard.js";

const execFileAsync = promisify(execFile);
const SAFE_GIT_REF_RE = /^[a-zA-Z0-9._/~^][a-zA-Z0-9._/~^-]*$/;

export const checkDriftInputSchema = {
  projectRoot: z
    .string()
    .optional()
    .describe("Optional absolute workspace root directory"),
  baseRef: z
    .string()
    .optional()
    .describe("Git baseline ref to compare against (defaults to 'HEAD')"),
  filePaths: z
    .array(z.string())
    .optional()
    .describe("Optional specific files/directories to check instead of all git-changed files"),
  strictMode: z
    .boolean()
    .optional()
    .describe("Fail oracle (passed=false) on RED risk tier (defaults to true)"),
};

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

async function getGitBlob(baseRef: string, relPath: string, cwd: string): Promise<string | null> {
  const posixRel = relPath.replace(/\\/g, "/");
  try {
    return await runGit(["show", `${baseRef}:${posixRel}`], cwd);
  } catch {
    return null;
  }
}

async function discoverChangedFiles(baseRef: string, root: string): Promise<string[]> {
  const trackedRaw = await runGit(["diff", "--name-only", baseRef], root);
  const untrackedRaw = await runGit(["ls-files", "--others", "--exclude-standard"], root);
  const combined = `${trackedRaw}\n${untrackedRaw}`
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && detectLanguage(s) !== null);
  return Array.from(new Set(combined));
}

export async function handleCheckArchitectureDrift(args: {
  projectRoot?: string;
  baseRef?: string;
  filePaths?: string[];
  strictMode?: boolean;
}) {
  if (args.projectRoot) {
    serverState.projectRoot = path.resolve(args.projectRoot);
  }
  const root = serverState.projectRoot;
  const baseRef = args.baseRef ?? "HEAD";
  const strictMode = args.strictMode !== false;

  if (!SAFE_GIT_REF_RE.test(baseRef)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid git baseRef format.", baseRef }),
        },
      ],
    };
  }

  let candidatePaths: string[];
  try {
    if (args.filePaths && args.filePaths.length > 0) {
      candidatePaths = args.filePaths;
    } else {
      candidatePaths = await discoverChangedFiles(baseRef, root);
    }
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Failed to inspect git repository changes.",
            detail: err instanceof Error ? err.message : String(err),
          }),
        },
      ],
    };
  }

  if (candidatePaths.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            passed: true,
            riskTier: "GREEN",
            baseRef,
            changedFilesCount: 0,
            summary: "No changed TypeScript or Python files detected.",
            newImplicitWarnings: [],
            removedInputGates: [],
            contractMismatches: [],
            testTampering: [],
            slopWarnings: [],
          }),
        },
      ],
    };
  }

  const { valid, rejected } = await resolveSandboxedPaths(candidatePaths, root);
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

  const beforeSources: SourceEntry[] = [];
  const afterSources: SourceEntry[] = [];
  const testTampering: TestTamperFinding[] = [];
  const slopWarnings: SlopWarning[] = [];

  for (const absPath of valid) {
    const lang = detectLanguage(absPath);
    if (!lang) continue;

    const relPath = path.relative(root, absPath) || path.basename(absPath);
    let afterCode: string | null = null;
    try {
      const stat = await fs.stat(absPath);
      if (stat.size <= MAX_FILE_BYTES) {
        afterCode = await fs.readFile(absPath, "utf8");
      }
    } catch {
      afterCode = null;
    }

    const beforeCode = await getGitBlob(baseRef, relPath, root);

    if (isTestFilePath(relPath)) {
      if (afterCode !== null) {
        testTampering.push(...detectTestTampering(beforeCode, afterCode, relPath, lang));
      }
      continue;
    }

    if (beforeCode !== null) {
      beforeSources.push({ relPath, code: beforeCode });
    }
    if (afterCode !== null) {
      afterSources.push({ relPath, code: afterCode });

      const afterSlop = await analyzeSlopWarnings(afterCode, relPath, lang);
      if (beforeCode === null) {
        slopWarnings.push(...afterSlop);
      } else {
        const beforeSlop = await analyzeSlopWarnings(beforeCode, relPath, lang);
        const beforeKeys = new Set(
          beforeSlop.map((w) => `${w.ruleId}:${w.symbol ?? ""}:${w.message}`)
        );
        for (const w of afterSlop) {
          if (!beforeKeys.has(`${w.ruleId}:${w.symbol ?? ""}:${w.message}`)) {
            slopWarnings.push(w);
          }
        }
      }
    }
  }

  const beforeGraph = await buildFlowGraphFromSources(beforeSources, root);
  const afterGraph = await buildFlowGraphFromSources(afterSources, root);
  const { diff } = computeGraphDiff(beforeGraph, afterGraph);

  const addedNodeSet = new Set(diff.addedNodeIds);
  const removedNodeSet = new Set(diff.removedNodeIds);

  const newImplicitWarnings = afterGraph.nodes
    .filter((n) => addedNodeSet.has(n.id) && n.category === "IMPLICIT_WARNING")
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      filePath: n.filePath,
      lineRange: n.lineRange,
      warning: n.metadata?.warningMessage,
    }));

  const removedInputGates = beforeGraph.nodes
    .filter((n) => removedNodeSet.has(n.id) && n.category === "INPUT_GATE")
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      filePath: n.filePath,
      lineRange: n.lineRange,
    }));

  const newDbWrites = afterGraph.nodes.filter(
    (n) =>
      addedNodeSet.has(n.id) &&
      n.category === "OUTPUT_GATE" &&
      (n.outputFormat === "Database Mutation" || n.outputFormat === "ORM Transaction")
  );

  const newStateOrOutputs = afterGraph.nodes.filter(
    (n) =>
      addedNodeSet.has(n.id) &&
      (n.category === "STATE_MACHINE" || n.category === "OUTPUT_GATE")
  );

  const contractMismatches = detectContractMismatches(afterGraph);

  const isRed =
    newImplicitWarnings.length > 0 ||
    removedInputGates.length > 0 ||
    contractMismatches.length > 0 ||
    testTampering.length > 0 ||
    newDbWrites.length > 0;

  const isYellow = !isRed && (newStateOrOutputs.length > 0 || slopWarnings.length > 0);
  const riskTier: "GREEN" | "YELLOW" | "RED" = isRed ? "RED" : isYellow ? "YELLOW" : "GREEN";
  const passed = strictMode
    ? riskTier !== "RED"
    : testTampering.length === 0 && contractMismatches.length === 0;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          passed,
          riskTier,
          baseRef,
          changedFilesCount: valid.length,
          diffCounts: {
            addedNodes: diff.addedNodeIds.length,
            modifiedNodes: diff.modifiedNodeIds.length,
            removedNodes: diff.removedNodeIds.length,
          },
          newImplicitWarnings,
          removedInputGates,
          contractMismatches,
          testTampering,
          slopWarnings,
        }),
      },
    ],
  };
}
