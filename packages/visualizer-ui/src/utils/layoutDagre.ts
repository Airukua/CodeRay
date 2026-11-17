import dagre from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { FlowEdge, FlowGraphPayload, FlowNode } from "@flowguard/shared";
import type { GroupBoxData } from "../components/nodes/GroupBoxNode";

export const NODE_WIDTH = 320;
export const NODE_HEIGHT = 200;

export interface FlowNodeData extends Record<string, unknown> {
  flowNode: FlowNode;
}

function makeGroupId(groupTitle: string): string {
  return `group_${groupTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function buildGroupedLayout(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  collapsedGroups: Set<string>,
  onToggleGroup?: (groupTitle: string) => void
): { nodes: Node[]; edges: FlowEdge[] } {
  const groups = new Map<string, FlowNode[]>();
  const nodeToGroup = new Map<string, string>();

  for (const fn of flowNodes) {
    const key = fn.group || "Other";
    const list = groups.get(key) ?? [];
    list.push(fn);
    groups.set(key, list);
    nodeToGroup.set(fn.id, key);
  }

  const PAD_X = 24;
  const PAD_TOP = 58;
  const PAD_BOTTOM = 24;
  const NODE_GAP_X = 160;
  const NODE_GAP_Y = 36;
  const MAX_COLS = 1;
  const GROUP_GAP_X = 150;
  const GROUP_GAP_Y = 80;
  const MAX_ROW_WIDTH = 99999;

  const resultNodes: Node[] = [];
  let cursorX = 40;
  let cursorY = 40;
  let rowMaxHeight = 0;

  for (const [groupTitle, items] of groups.entries()) {
    items.sort((a, b) => {
      if (a.stepOrder !== undefined && b.stepOrder !== undefined) {
        return a.stepOrder - b.stepOrder;
      }
      return a.lineRange[0] - b.lineRange[0];
    });

    const isCollapsed = collapsedGroups.has(groupTitle);
    const cols = isCollapsed ? 1 : Math.min(MAX_COLS, Math.max(1, items.length));
    const rows = isCollapsed ? 1 : Math.ceil(items.length / MAX_COLS);

    const groupWidth = isCollapsed
      ? 360
      : PAD_X * 2 + cols * NODE_WIDTH + Math.max(0, cols - 1) * NODE_GAP_X;
    const groupHeight = isCollapsed
      ? 72
      : PAD_TOP + rows * NODE_HEIGHT + Math.max(0, rows - 1) * NODE_GAP_Y + PAD_BOTTOM;

    if (cursorX > 40 && cursorX + groupWidth > MAX_ROW_WIDTH) {
      cursorX = 40;
      cursorY += rowMaxHeight + GROUP_GAP_Y;
      rowMaxHeight = 0;
    }

    const groupId = makeGroupId(groupTitle);
    const groupData: GroupBoxData = {
      title: groupTitle,
      count: items.length,
      collapsed: isCollapsed,
      onToggle: onToggleGroup ? () => onToggleGroup(groupTitle) : undefined,
    };

    resultNodes.push({
      id: groupId,
      type: "GROUP_BOX",
      position: { x: cursorX, y: cursorY },
      style: { width: groupWidth, height: groupHeight },
      data: groupData,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    });

    if (!isCollapsed) {
      items.forEach((fn, index) => {
        const col = index % MAX_COLS;
        const row = Math.floor(index / MAX_COLS);
        resultNodes.push({
          id: fn.id,
          type: fn.category,
          position: {
            x: cursorX + PAD_X + col * (NODE_WIDTH + NODE_GAP_X),
            y: cursorY + PAD_TOP + row * (NODE_HEIGHT + NODE_GAP_Y),
          },
          data: { flowNode: fn },
        });
      });
    }

    rowMaxHeight = Math.max(rowMaxHeight, groupHeight);
    cursorX += groupWidth + GROUP_GAP_X;
  }

  // Remap edges when a source or target group is collapsed
  const remappedEdges: FlowEdge[] = [];
  const seenEdgeKeys = new Set<string>();

  for (const fe of flowEdges) {
    const srcGroup = nodeToGroup.get(fe.source);
    const tgtGroup = nodeToGroup.get(fe.target);
    const srcCollapsed = srcGroup ? collapsedGroups.has(srcGroup) : false;
    const tgtCollapsed = tgtGroup ? collapsedGroups.has(tgtGroup) : false;

    const mappedSource = srcCollapsed && srcGroup ? makeGroupId(srcGroup) : fe.source;
    const mappedTarget = tgtCollapsed && tgtGroup ? makeGroupId(tgtGroup) : fe.target;

    if (mappedSource === mappedTarget) continue;

    const dedupeKey = `${mappedSource}__${mappedTarget}__${fe.label ?? ""}`;
    if (seenEdgeKeys.has(dedupeKey)) continue;
    seenEdgeKeys.add(dedupeKey);

    remappedEdges.push({
      ...fe,
      id: srcCollapsed || tgtCollapsed ? `collapsed_${dedupeKey}` : fe.id,
      source: mappedSource,
      target: mappedTarget,
    });
  }

  return { nodes: resultNodes, edges: remappedEdges };
}

export function buildLayoutedGraph(
  payload: FlowGraphPayload,
  collapsedGroups: Set<string> = new Set(),
  onToggleGroup?: (groupTitle: string) => void
): {
  nodes: Node[];
  edges: Edge[];
} {
  const hasGroups = payload.nodes.some((n) => Boolean(n.group));

  let nodes: Node[];
  let activeEdges: FlowEdge[] = payload.edges;

  if (hasGroups) {
    const grouped = buildGroupedLayout(
      payload.nodes,
      payload.edges,
      collapsedGroups,
      onToggleGroup
    );
    nodes = grouped.nodes;
    activeEdges = grouped.edges;
  } else {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 64, ranksep: 200 });

    for (const fn of payload.nodes) {
      g.setNode(fn.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const fe of payload.edges) {
      if (g.hasNode(fe.source) && g.hasNode(fe.target)) {
        g.setEdge(fe.source, fe.target);
      }
    }

    dagre.layout(g);

    nodes = payload.nodes.map((fn) => {
      const pos = g.node(fn.id);
      return {
        id: fn.id,
        type: fn.category,
        position: {
          x: pos ? pos.x - NODE_WIDTH / 2 : 60,
          y: pos ? pos.y - NODE_HEIGHT / 2 : 60,
        },
        data: { flowNode: fn },
      };
    });
  }

  const targetEdgeCount = new Map<string, number>();
  const edges: Edge[] = activeEdges.map((fe) => {
    const isLeak = Boolean(fe.isImplicitLeak);
    const diffColor =
      fe.diffStatus === "added"
        ? "#22c55e"
        : fe.diffStatus === "removed"
          ? "#ef4444"
          : undefined;
    const stroke = diffColor ?? (isLeak ? "#ef4444" : "#64748b");
    const targetIdx = targetEdgeCount.get(fe.target) ?? 0;
    targetEdgeCount.set(fe.target, targetIdx + 1);
    const pathOffset = 28 + targetIdx * 36;

    return {
      id: fe.id,
      source: fe.source,
      target: fe.target,
      label: fe.label,
      type: "custom",
      animated: isLeak || fe.diffStatus === "added",
      style: {
        stroke,
        strokeWidth: isLeak ? 2.5 : 1.75,
        strokeDasharray: isLeak ? "6 4" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
      },
      data: {
        flowEdge: fe,
        isLeak,
        pathOffset,
      },
    };
  });

  return { nodes, edges };
}
