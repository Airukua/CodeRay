import type { FlowGraphPayload, GraphDiff } from "@flowguard/shared";

/**
 * Compares `previous` and `current` graphs, returning the `GraphDiff`
 * and a cloned `FlowGraphPayload` with `diffStatus` annotated on nodes and edges.
 */
export function computeGraphDiff(
  previous: FlowGraphPayload | null,
  current: FlowGraphPayload
): { diff: GraphDiff; annotatedGraph: FlowGraphPayload } {
  if (!previous) {
    const diff: GraphDiff = {
      addedNodeIds: current.nodes.map((n) => n.id),
      removedNodeIds: [],
      modifiedNodeIds: [],
      addedEdgeIds: current.edges.map((e) => e.id),
      removedEdgeIds: [],
    };
    return {
      diff,
      annotatedGraph: {
        ...current,
        nodes: current.nodes.map((n) => ({ ...n, diffStatus: "added" })),
        edges: current.edges.map((e) => ({ ...e, diffStatus: "added" })),
        diff,
      },
    };
  }

  const prevNodeMap = new Map(previous.nodes.map((n) => [n.id, n]));
  const currNodeMap = new Map(current.nodes.map((n) => [n.id, n]));
  const prevEdgeIds = new Set(previous.edges.map((e) => e.id));
  const currEdgeIds = new Set(current.edges.map((e) => e.id));

  const addedNodeIds: string[] = [];
  const modifiedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];

  const annotatedNodes = current.nodes.map((node) => {
    const prev = prevNodeMap.get(node.id);
    if (!prev) {
      addedNodeIds.push(node.id);
      return { ...node, diffStatus: "added" as const };
    }
    const changed =
      prev.codeSnippet !== node.codeSnippet ||
      prev.schemaOrType !== node.schemaOrType ||
      prev.category !== node.category;
    if (changed) {
      modifiedNodeIds.push(node.id);
      return { ...node, diffStatus: "modified" as const };
    }
    return { ...node, diffStatus: "unchanged" as const };
  });

  for (const prev of previous.nodes) {
    if (!currNodeMap.has(prev.id)) {
      removedNodeIds.push(prev.id);
    }
  }

  const addedEdgeIds: string[] = [];
  const removedEdgeIds: string[] = [];

  const annotatedEdges = current.edges.map((edge) => {
    if (!prevEdgeIds.has(edge.id)) {
      addedEdgeIds.push(edge.id);
      return { ...edge, diffStatus: "added" as const };
    }
    return { ...edge, diffStatus: "unchanged" as const };
  });

  for (const prev of previous.edges) {
    if (!currEdgeIds.has(prev.id)) {
      removedEdgeIds.push(prev.id);
    }
  }

  const diff: GraphDiff = {
    addedNodeIds,
    removedNodeIds,
    modifiedNodeIds,
    addedEdgeIds,
    removedEdgeIds,
  };

  return {
    diff,
    annotatedGraph: {
      ...current,
      nodes: annotatedNodes,
      edges: annotatedEdges,
      diff,
    },
  };
}
