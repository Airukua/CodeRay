import dagre from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { FlowEdge, FlowGraphPayload, FlowNode } from "@flowguard/shared";
import type { GroupBoxData } from "../components/nodes/GroupBoxNode";

export const NODE_WIDTH = 320;
export const NODE_HEIGHT = 220;

export interface FlowNodeData extends Record<string, unknown> {
  flowNode: FlowNode;
}

function makeGroupId(groupTitle: string): string {
  return `group_${groupTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function buildStoryStageLayout(
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

  const PAD_X = 28;
  const PAD_TOP = 58;
  const PAD_BOTTOM = 28;
  const NODE_GAP_Y = 40;
  const GROUP_GAP_X = 260;

  const resultNodes: Node[] = [];
  let cursorX = 40;
  const cursorY = 40;

  for (const [groupTitle, items] of groups.entries()) {
    items.sort((a, b) => {
      if (a.stepOrder !== undefined && b.stepOrder !== undefined) {
        return a.stepOrder - b.stepOrder;
      }
      return a.lineRange[0] - b.lineRange[0];
    });

    const isCollapsed = collapsedGroups.has(groupTitle);
    const groupWidth = isCollapsed ? 360 : PAD_X * 2 + NODE_WIDTH;
    const groupHeight = isCollapsed
      ? 72
      : PAD_TOP + items.length * NODE_HEIGHT + Math.max(0, items.length - 1) * NODE_GAP_Y + PAD_BOTTOM;

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
        resultNodes.push({
          id: fn.id,
          type: fn.category,
          position: {
            x: cursorX + PAD_X,
            y: cursorY + PAD_TOP + index * (NODE_HEIGHT + NODE_GAP_Y),
          },
          data: { flowNode: fn },
        });
      });
    }

    cursorX += groupWidth + GROUP_GAP_X;
  }

  return {
    nodes: resultNodes,
    edges: remapCollapsedEdges(flowEdges, nodeToGroup, collapsedGroups),
  };
}

function buildFileGridLayout(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  collapsedGroups: Set<string>,
  onToggleGroup?: (groupTitle: string) => void
): { nodes: Node[]; edges: FlowEdge[] } {
  const groups = new Map<string, FlowNode[]>();
  const nodeToGroup = new Map<string, string>();

  for (const fn of flowNodes) {
    const key = fn.filePath;
    const list = groups.get(key) ?? [];
    list.push(fn);
    groups.set(key, list);
    nodeToGroup.set(fn.id, key);
  }

  const PAD_X = 24;
  const PAD_TOP = 58;
  const PAD_BOTTOM = 24;
  const GROUP_GAP_X = 120;
  const GROUP_GAP_Y = 64;
  const MAX_ROW_WIDTH = 2800;

  const resultNodes: Node[] = [];
  let cursorX = 40;
  let cursorY = 40;
  let rowMaxHeight = 0;

  for (const [filePath, items] of groups.entries()) {
    const isCollapsed = collapsedGroups.has(filePath);
    const shortTitle = filePath.split("/").pop() || filePath;

    let groupWidth = 360;
    let groupHeight = 72;
    const localPositions = new Map<string, { x: number; y: number }>();

    if (!isCollapsed) {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 120 });

      const itemIds = new Set(items.map((n) => n.id));
      for (const fn of items) {
        g.setNode(fn.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      }
      for (const fe of flowEdges) {
        if (itemIds.has(fe.source) && itemIds.has(fe.target)) {
          g.setEdge(fe.source, fe.target);
        }
      }
      dagre.layout(g);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const fn of items) {
        const pos = g.node(fn.id);
        const x = pos ? pos.x - NODE_WIDTH / 2 : 0;
        const y = pos ? pos.y - NODE_HEIGHT / 2 : 0;
        localPositions.set(fn.id, { x, y });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + NODE_WIDTH);
        maxY = Math.max(maxY, y + NODE_HEIGHT);
      }

      const contentW = Math.max(NODE_WIDTH, maxX - minX);
      const contentH = Math.max(NODE_HEIGHT, maxY - minY);
      groupWidth = PAD_X * 2 + contentW;
      groupHeight = PAD_TOP + contentH + PAD_BOTTOM;

      for (const [id, pos] of localPositions.entries()) {
        localPositions.set(id, {
          x: pos.x - minX + PAD_X,
          y: pos.y - minY + PAD_TOP,
        });
      }
    }

    if (cursorX > 40 && cursorX + groupWidth > MAX_ROW_WIDTH) {
      cursorX = 40;
      cursorY += rowMaxHeight + GROUP_GAP_Y;
      rowMaxHeight = 0;
    }

    const groupId = makeGroupId(filePath);
    const groupData: GroupBoxData = {
      title: shortTitle,
      count: items.length,
      collapsed: isCollapsed,
      onToggle: onToggleGroup ? () => onToggleGroup(filePath) : undefined,
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
      for (const fn of items) {
        const local = localPositions.get(fn.id) ?? { x: PAD_X, y: PAD_TOP };
        resultNodes.push({
          id: fn.id,
          type: fn.category,
          position: {
            x: cursorX + local.x,
            y: cursorY + local.y,
          },
          data: { flowNode: fn },
        });
      }
    }

    rowMaxHeight = Math.max(rowMaxHeight, groupHeight);
    cursorX += groupWidth + GROUP_GAP_X;
  }

  return {
    nodes: resultNodes,
    edges: remapCollapsedEdges(flowEdges, nodeToGroup, collapsedGroups),
  };
}

function remapCollapsedEdges(
  flowEdges: FlowEdge[],
  nodeToGroup: Map<string, string>,
  collapsedGroups: Set<string>
): FlowEdge[] {
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

  return remappedEdges;
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

  const layout = hasGroups
    ? buildStoryStageLayout(payload.nodes, payload.edges, collapsedGroups, onToggleGroup)
    : buildFileGridLayout(payload.nodes, payload.edges, collapsedGroups, onToggleGroup);

  const targetEdgeCount = new Map<string, number>();
  const edges: Edge[] = layout.edges.map((fe) => {
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

  return { nodes: layout.nodes, edges };
}
