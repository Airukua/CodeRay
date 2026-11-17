import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FlowGraphPayloadSchema,
  type FlowGraphPayload,
  type UiSelection,
} from "@flowguard/shared";

const GRAPH_CACHE_FILE = path.join(os.tmpdir(), "coderay-last-graph.json");

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
  activeUiSelection: UiSelection | null;
}

export const serverState: ServerState = {
  projectRoot: process.cwd(),
  currentGraph: loadCachedGraph(),
  previousGraph: null,
  activeUiSelection: null,
};

export function updateGraphState(newGraph: FlowGraphPayload): void {
  serverState.previousGraph = serverState.currentGraph;
  serverState.currentGraph = newGraph;
  void fsp
    .writeFile(GRAPH_CACHE_FILE, JSON.stringify(newGraph), "utf8")
    .catch(() => {
      // Ignore cache write errors in read-only environments
    });
}

export function setUiSelection(selection: UiSelection): void {
  serverState.activeUiSelection = selection;
}
