import type { FlowGraphPayload, UiSelection } from "@flowguard/shared";

export interface ServerState {
  projectRoot: string;
  currentGraph: FlowGraphPayload | null;
  previousGraph: FlowGraphPayload | null;
  activeUiSelection: UiSelection | null;
}

export const serverState: ServerState = {
  projectRoot: process.cwd(),
  currentGraph: null,
  previousGraph: null,
  activeUiSelection: null,
};

export function updateGraphState(newGraph: FlowGraphPayload): void {
  serverState.previousGraph = serverState.currentGraph;
  serverState.currentGraph = newGraph;
}

export function setUiSelection(selection: UiSelection): void {
  serverState.activeUiSelection = selection;
}
