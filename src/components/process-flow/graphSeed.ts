import { NODE_WIDTH, SCENE_HEIGHT, SCENE_WIDTH, getNodeHeightForWafers } from "./constants";
import { orderProcessStepsByOccurrence } from "@/features/process-flows/step-order";
import { applyGraphDisplayOrder, autoLayoutNodes } from "./layout";
import { toFlowNodeRole } from "./labels";
import type { DiagramStep, DiagramTransition, FlowEdge, FlowNode } from "./types";

export function getInitialGraph(steps: DiagramStep[], transitions: DiagramTransition[]) {
  const sortedSteps = orderProcessStepsByOccurrence(steps, transitions);
  const nodes: FlowNode[] = sortedSteps.map((step, index): FlowNode => ({
      id: step.id,
      label: step.name,
      subLabel: step.process_area,
      wafers: step.wafers,
      x: step.canvas_x ?? 0,
      y: step.canvas_y ?? 0,
      width: NODE_WIDTH,
      height: getNodeHeightForWafers(step.wafers),
      role: toFlowNodeRole(step.node_type),
      executionMode: step.execution_mode ?? "main",
      order: index + 1,
      requiredReviewerId: step.required_reviewer_id ?? null,
      requiredReviewerName: step.required_reviewer_name ?? null,
      parametersSchema: step.parameters_schema ?? {},
      revision: step.revision
    }));

  const nodeIds = new Set(nodes.filter((node) => node.executionMode === "main").map((node) => node.id));
  const persistedEdges: FlowEdge[] = transitions
    .filter((transition) => nodeIds.has(transition.from_step_id) && nodeIds.has(transition.to_step_id))
    .map((transition) => ({
      id: transition.id,
      from: transition.from_step_id,
      to: transition.to_step_id,
      kind: transition.edge_type
    }));
  const edges = persistedEdges;
  const hasMissingPositions = sortedSteps.some((step) => step.canvas_x === null || step.canvas_x === undefined || step.canvas_y === null || step.canvas_y === undefined);

  const displayOrderedNodes = applyGraphDisplayOrder(nodes, edges);

  return {
    nodes: hasMissingPositions
      ? autoLayoutNodes(displayOrderedNodes, edges, { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 })
      : displayOrderedNodes,
    edges
  };
}
