import { useMemo, useState } from "react";
import type { FlowEdge, FlowGraphPayload, FlowNode } from "@flowguard/shared";
import { Filter, Search, Wifi, WifiOff } from "lucide-react";
import { useFlowSocket } from "./hooks/useFlowSocket";
import { SwimlaneCanvas } from "./components/SwimlaneCanvas";
import { NodeInspector } from "./components/NodeInspector";

function resolveDefaultWsUrl(): string {
  const loc = globalThis.location;
  if (!loc) return "ws://localhost:4123";
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host || "localhost:4123"}`;
}

export function App() {
  const { graph, status, sendSelection } = useFlowSocket(resolveDefaultWsUrl());
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<FlowEdge | null>(null);
  const [fileFilter, setFileFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [connectedOnly, setConnectedOnly] = useState<boolean>(true);

  const fileOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of graph.nodes) {
      counts.set(n.filePath, (counts.get(n.filePath) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [graph.nodes]);

  const filteredGraph = useMemo<FlowGraphPayload>(() => {
    const connectedIds = new Set<string>();
    if (connectedOnly) {
      for (const e of graph.edges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }
    }
    const q = searchQuery.trim().toLowerCase();
    const nodes = graph.nodes.filter((n) => {
      if (fileFilter !== "ALL" && n.filePath !== fileFilter) return false;
      if (connectedOnly && !connectedIds.has(n.id)) return false;
      if (q) {
        const hay = `${n.label} ${n.filePath} ${n.schemaOrType ?? ""} ${n.metadata?.symbolName ?? ""} ${n.metadata?.scopeName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    return { ...graph, nodes, edges };
  }, [graph, fileFilter, searchQuery, connectedOnly]);

  const warningCount = filteredGraph.nodes.filter(
    (n) => n.category === "IMPLICIT_WARNING"
  ).length;

  const handleSelectNode = (node: FlowNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    sendSelection({
      selectedNodeId: node.id,
      filePath: node.filePath,
    });
  };

  const handleSelectEdge = (edge: FlowEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    sendSelection({
      selectedEdgeId: edge.id,
    });
  };

  const handleSendNote = (note: string) => {
    sendSelection({
      selectedNodeId: selectedNode?.id,
      selectedEdgeId: selectedEdge?.id,
      filePath: selectedNode?.filePath,
      userNote: note,
    });
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <img src="/logo.png" alt="CodeRay logo" className="h-6 w-6 shrink-0 rounded" />
          <span className="font-bold tracking-tight text-white">CodeRay MCP</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {filteredGraph.nodes.length}/{graph.nodes.length} nodes · {filteredGraph.edges.length} edges
          </span>
          {warningCount > 0 && (
            <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">
              {warningCount} Warning{warningCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="order-3 flex w-full flex-wrap items-center gap-2 lg:order-2 lg:w-auto">
          <div className="relative min-w-[140px] flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search node / symbol..."
              className="w-full rounded border border-slate-700 bg-slate-950 py-1 pl-7 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none sm:w-44"
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 sm:flex-initial">
            <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <select
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              aria-label="Filter by file"
              className="w-full max-w-[200px] truncate bg-transparent text-xs text-slate-200 focus:outline-none"
            >
              <option value="ALL" className="bg-slate-900">
                All files ({fileOptions.length})
              </option>
              {fileOptions.map(([fp, count]) => (
                <option key={fp} value={fp} className="bg-slate-900">
                  {fp.split("/").pop()} ({count})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setConnectedOnly((v) => !v)}
            className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              connectedOnly
                ? "border-sky-500 bg-sky-500/20 text-sky-300"
                : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"
            }`}
          >
            Connected only
          </button>
        </div>

        <div className="order-2 flex shrink-0 items-center gap-2 text-xs lg:order-3">
          {status === "connected" ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Live MCP Socket</span>
              <span className="sm:hidden">Live</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Preview Mode ({status})</span>
              <span className="sm:hidden">{status}</span>
            </span>
          )}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <SwimlaneCanvas
          graph={filteredGraph}
          onSelectNode={handleSelectNode}
          onSelectEdge={handleSelectEdge}
        />
        <NodeInspector
          projectRoot={graph.projectRoot}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          nodes={graph.nodes}
          edges={graph.edges}
          onSelectNode={handleSelectNode}
          onClose={() => {
            setSelectedNode(null);
            setSelectedEdge(null);
          }}
          onSendNote={handleSendNote}
        />
      </main>
    </div>
  );
}

export default App;
