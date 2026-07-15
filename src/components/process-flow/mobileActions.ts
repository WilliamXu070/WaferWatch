import { canMoveToAnotherStep } from "./checkpointPhase";
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
  sourceNodeId: string
) {
  if (!nodes.some((node) => node.id === sourceNodeId)) {
    return [];
  }

  return nodes
    .filter((node) => node.id !== sourceNodeId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Phone users can first tap a full-size process-step card, then choose an
 * approved Complete-side wafer from a normal HTML control. The canvas chips
 * intentionally stay compact at overview zoom, so they are not a dependable
 * touch target for this action.
 */
export function getMobileMoveReadyWafers(node: FlowNode | null | undefined) {
  return node?.wafers.filter((wafer) => canMoveToAnotherStep(wafer.currentStepStatus)) ?? [];
}
