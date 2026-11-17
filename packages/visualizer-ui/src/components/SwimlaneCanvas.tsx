import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { FlowEdge, FlowGraphPayload, FlowNode } from "@flowguard/shared";
import { buildLayoutedGraph, type FlowNodeData } from "../utils/layoutDagre";
import { InputGateNode } from "./nodes/InputGateNode";
import { StateMachineNode } from "./nodes/StateMachineNode";
import { ImplicitWarningNode } from "./nodes/ImplicitWarningNode";
import { OutputGateNode } from "./nodes/OutputGateNode";

const nodeTypes = {
  INPUT_GATE: InputGateNode,
  STATE_MACHINE: StateMachineNode,
  IMPLICIT_WARNING: ImplicitWarningNode,
  OUTPUT_GATE: OutputGateNode,
};

interface SwimlaneCanvasProps {
  graph: FlowGraphPayload;
  onSelectNode: (node: FlowNode) => void;
  onSelectEdge: (edge: FlowEdge) => void;
}

export function SwimlaneCanvas({
  graph,
  onSelectNode,
  onSelectEdge,
}: SwimlaneCanvasProps) {
  const layouted = useMemo(() => buildLayoutedGraph(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  return (
    <div className="relative h-full w-full flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          const fn = (node.data as FlowNodeData | undefined)?.flowNode;
          if (fn) onSelectNode(fn);
        }}
        onEdgeClick={(_, edge) => {
          const fe = (edge.data as { flowEdge?: FlowEdge } | undefined)?.flowEdge;
          if (fe) onSelectEdge(fe);
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        colorMode="dark"
      >
        <Panel position="top-center" className="pointer-events-none w-full max-w-5xl px-4">
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-800/80 bg-slate-900/80 px-4 py-2 text-center text-xs font-bold tracking-wide backdrop-blur">
            <div className="text-emerald-400">1. INPUT GATE (Props / Payload / Pydantic)</div>
            <div className="text-sky-400">
              2. STATE MACHINE & <span className="text-red-400">IMPLICIT WARNINGS</span>
            </div>
            <div className="text-purple-400">3. OUTPUT GATE (JSX / JSON / DB)</div>
          </div>
        </Panel>
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "INPUT_GATE") return "#10b981";
            if (n.type === "IMPLICIT_WARNING") return "#ef4444";
            if (n.type === "OUTPUT_GATE") return "#a855f7";
            return "#0ea5e9";
          }}
          maskColor="rgba(2, 6, 23, 0.75)"
        />
        <Background gap={20} color="#1e293b" />
      </ReactFlow>
    </div>
  );
}
