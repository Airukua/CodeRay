import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
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
import { GroupBoxNode } from "./nodes/GroupBoxNode";
import { CustomFlowEdge } from "./edges/CustomFlowEdge";

const nodeTypes = {
  INPUT_GATE: InputGateNode,
  STATE_MACHINE: StateMachineNode,
  IMPLICIT_WARNING: ImplicitWarningNode,
  OUTPUT_GATE: OutputGateNode,
  GROUP_BOX: GroupBoxNode,
};

const edgeTypes = {
  custom: CustomFlowEdge,
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const handleToggleGroup = useCallback((groupTitle: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupTitle)) {
        next.delete(groupTitle);
      } else {
        next.add(groupTitle);
      }
      return next;
    });
  }, []);

  const layouted = useMemo(
    () => buildLayoutedGraph(graph, collapsedGroups, handleToggleGroup),
    [graph, collapsedGroups, handleToggleGroup]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  return (
    <div className="relative flex h-full w-full flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
          minZoom={0.2}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          colorMode="dark"
        >
          <Controls />
          <MiniMap
            className="hidden sm:block"
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
    </div>
  );
}
