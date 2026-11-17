import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FlowGraphPayloadSchema,
  type FlowGraphPayload,
} from "@flowguard/shared";

const GRAPH_CACHE_DIR = path.join(os.homedir(), ".cache", "coderay");
const GRAPH_CACHE_FILE = path.join(GRAPH_CACHE_DIR, "last-graph.json");

function loadCachedGraph(): FlowGraphPayload | null {
  try {
    const raw = fs.readFileSync(GRAPH_CACHE_FILE, "utf8");
    const parsed = FlowGraphPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface ServerState {
  projectRoot: string;
  currentGraph: FlowGraphPayload | null;
  previousGraph: FlowGraphPayload | null;
}

export const serverState: ServerState = {
  projectRoot: process.cwd(),
  currentGraph: loadCachedGraph(),
  previousGraph: null,
};

export function updateGraphState(newGraph: FlowGraphPayload): void {
  serverState.previousGraph = serverState.currentGraph;
  serverState.currentGraph = newGraph;
  void fsp
    .mkdir(GRAPH_CACHE_DIR, { recursive: true, mode: 0o700 })
    .then(() =>
      fsp.writeFile(GRAPH_CACHE_FILE, JSON.stringify(newGraph), {
        encoding: "utf8",
        mode: 0o600,
      })
    )
    .catch(() => {
      // Ignore cache write errors in read-only environments
    });
}
