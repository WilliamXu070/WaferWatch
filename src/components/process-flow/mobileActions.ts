import type { FlowEdge, FlowNode } from "./types";

export function getSelectedLinkedStepEdge(
  edges: readonly FlowEdge[],
  selectedNodeIds: ReadonlySet<string>
) {
  if (selectedNodeIds.size !== 1) {
    return null;
  }

  const selectedNodeId = selectedNodeIds.values().next().value;
  return edges.find((edge) => edge.from === selectedNodeId && edge.kind === "flow") ?? null;
}

export function getAvailableWaferMoveTargets(
  nodes: readonly FlowNode[],
  _edges: readonly FlowEdge[],
  sourceNodeId: string,
  returnStepId?: string | null
) {
  if (!nodes.some((node) => node.id === sourceNodeId)) {
    return [];
  }

  return nodes
    .filter((node) => node.id !== sourceNodeId)
    .sort((a, b) => {
      if (a.id === returnStepId) return -1;
      if (b.id === returnStepId) return 1;
      if (a.executionMode !== b.executionMode) {
        return a.executionMode === "anytime" ? -1 : 1;
      }
      return a.order - b.order;
    });
}
