import { useState } from "react";
import type { FlowEdge, FlowNode } from "@flowguard/shared";
import { Activity, Wifi, WifiOff } from "lucide-react";
import { useFlowSocket } from "./hooks/useFlowSocket";
import { SwimlaneCanvas } from "./components/SwimlaneCanvas";
import { NodeInspector } from "./components/NodeInspector";

export function App() {
  const { graph, status, sendSelection } = useFlowSocket();
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<FlowEdge | null>(null);

  const warningCount = graph.nodes.filter(
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
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-sky-400" />
          <span className="font-bold tracking-tight text-white">CodeRay MCP</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
          {warningCount > 0 && (
            <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">
              {warningCount} Implicit Warning{warningCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          {status === "connected" ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> Live MCP Socket
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <WifiOff className="h-3.5 w-3.5" /> Preview Mode ({status})
            </span>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <SwimlaneCanvas
          graph={graph}
          onSelectNode={handleSelectNode}
          onSelectEdge={handleSelectEdge}
        />
        <NodeInspector
          projectRoot={graph.projectRoot}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
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
