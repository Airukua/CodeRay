import fs from "node:fs/promises";
import path from "node:path";
import type { FlowEdge, FlowGraphPayload, FlowNode } from "@flowguard/shared";
import { detectLanguage } from "./astEngine.js";
import { analyzeTypeScript } from "./tsReactAnalyzer.js";
import { analyzePython } from "./pythonAnalyzer.js";

function normalizeEndpoint(ep: string): string {
  return ep.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
}

export interface SourceEntry {
  relPath: string;
  code: string;
}

/**
 * Builds a FlowGraphPayload from in-memory source entries (used by both disk scans
 * and Git baseline drift comparisons).
 */
export async function buildFlowGraphFromSources(
  sources: SourceEntry[],
  projectRoot: string
): Promise<FlowGraphPayload> {
  const allNodes: FlowNode[] = [];
  const allEdges: FlowEdge[] = [];

  for (const { relPath, code } of sources) {
    const lang = detectLanguage(relPath);
    if (!lang) continue;

    const result =
      lang === "python"
        ? await analyzePython(code, relPath)
        : await analyzeTypeScript(code, relPath, lang);

    allNodes.push(...result.nodes);
    allEdges.push(...result.edges);
  }

  // Link cross-boundary edges where a frontend fetch OUTPUT_GATE targets a backend INPUT_GATE endpoint
  const backendEndpoints = allNodes.filter(
    (n) => n.category === "INPUT_GATE" && n.metadata?.endpoint
  );
  const frontendFetches = allNodes.filter(
    (n) => n.category === "OUTPUT_GATE" && n.metadata?.endpoint
  );

  for (const fe of frontendFetches) {
    const feEp = normalizeEndpoint(fe.metadata!.endpoint!);
    for (const be of backendEndpoints) {
      const beEp = normalizeEndpoint(be.metadata!.endpoint!);
      if (feEp === beEp || feEp.endsWith(beEp)) {
        allEdges.push({
          id: `e_cross_${fe.id}__${be.id}`,
          source: fe.id,
          target: be.id,
          label: `HTTP ${beEp}`,
        });
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    projectRoot,
    nodes: allNodes,
    edges: allEdges,
  };
}

export async function buildFlowGraph(
  absFilePaths: string[],
  projectRoot: string
): Promise<FlowGraphPayload> {
  const sources: SourceEntry[] = [];

  for (const absPath of absFilePaths) {
    if (!detectLanguage(absPath)) continue;
    try {
      const code = await fs.readFile(absPath, "utf-8");
      const relPath = path.relative(projectRoot, absPath) || path.basename(absPath);
      sources.push({ relPath, code });
    } catch {
      continue;
    }
  }

  return buildFlowGraphFromSources(sources, projectRoot);
}
