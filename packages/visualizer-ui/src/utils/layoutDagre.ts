import dagre from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { FlowGraphPayload, FlowNode, NodeCategory } from "@flowguard/shared";

export const NODE_WIDTH = 270;
export const NODE_HEIGHT = 110;

const COLUMN_X: Record<NodeCategory, number> = {
  INPUT_GATE: 60,
  STATE_MACHINE: 430,
  IMPLICIT_WARNING: 430,
  OUTPUT_GATE: 800,
};

export interface FlowNodeData extends Record<string, unknown> {
  flowNode: FlowNode;
}

export function buildLayoutedGraph(payload: FlowGraphPayload): {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 120 });

  for (const fn of payload.nodes) {
    g.setNode(fn.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const fe of payload.edges) {
    if (g.hasNode(fe.source) && g.hasNode(fe.target)) {
      g.setEdge(fe.source, fe.target);
    }
  }

  dagre.layout(g);

  // Track Y positions per swimlane column to prevent vertical collisions when locking X
  const columnBuckets: Record<"LEFT" | "CENTER" | "RIGHT", FlowNode[]> = {
    LEFT: [],
    CENTER: [],
    RIGHT: [],
  };

  for (const fn of payload.nodes) {
    if (fn.category === "INPUT_GATE") columnBuckets.LEFT.push(fn);
    else if (fn.category === "OUTPUT_GATE") columnBuckets.RIGHT.push(fn);
    else columnBuckets.CENTER.push(fn);
  }

  const yPositionMap = new Map<string, number>();
  for (const bucket of Object.values(columnBuckets)) {
    bucket.sort((a, b) => (g.node(a.id)?.y ?? 0) - (g.node(b.id)?.y ?? 0));
    bucket.forEach((fn, index) => {
      yPositionMap.set(fn.id, 90 + index * (NODE_HEIGHT + 36));
    });
  }

  const nodes: Node<FlowNodeData>[] = payload.nodes.map((fn) => ({
    id: fn.id,
    type: fn.category,
    position: {
      x: COLUMN_X[fn.category],
      y: yPositionMap.get(fn.id) ?? 90,
    },
    data: { flowNode: fn },
  }));

  const edges: Edge[] = payload.edges.map((fe) => {
    const isLeak = Boolean(fe.isImplicitLeak);
    const diffColor =
      fe.diffStatus === "added"
        ? "#22c55e"
        : fe.diffStatus === "removed"
          ? "#ef4444"
          : undefined;
    const stroke = diffColor ?? (isLeak ? "#ef4444" : "#64748b");

    return {
      id: fe.id,
      source: fe.source,
      target: fe.target,
      label: fe.label,
      type: "smoothstep",
      animated: isLeak || fe.diffStatus === "added",
      style: {
        stroke,
        strokeWidth: isLeak ? 2.5 : 1.75,
        strokeDasharray: isLeak ? "6 4" : undefined,
      },
      labelStyle: {
        fill: isLeak ? "#fca5a5" : "#cbd5e1",
        fontSize: 11,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: "#0f172a",
        fillOpacity: 0.85,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
      },
      data: { flowEdge: fe },
    };
  });

  return { nodes, edges };
}
