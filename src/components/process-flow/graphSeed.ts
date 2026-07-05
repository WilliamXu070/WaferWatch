import { NODE_WIDTH, SCENE_HEIGHT, SCENE_WIDTH, getNodeHeightForWaferCount } from "./constants";
import { autoLayoutNodes } from "./layout";
import { toFlowNodeRole } from "./labels";
import type { DiagramStep, DiagramTransition, FlowEdge, FlowNode } from "./types";

export function getInitialGraph(steps: DiagramStep[], transitions: DiagramTransition[]) {
  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
  const nodes: FlowNode[] = sortedSteps.map((step, index): FlowNode => ({
      id: step.id,
      label: step.name,
      subLabel: step.process_area,
      wafers: step.wafers,
      x: step.canvas_x ?? 0,
      y: step.canvas_y ?? 0,
      width: NODE_WIDTH,
      height: getNodeHeightForWaferCount(step.wafers.length),
      role: toFlowNodeRole(step.node_type),
      order: index + 1
    }));

  const nodeIds = new Set(nodes.map((node) => node.id));
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

  return {
    nodes: hasMissingPositions ? autoLayoutNodes(nodes, edges, { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }) : nodes,
    edges
  };
}
