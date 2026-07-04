import { NODE_WIDTH, NODE_HEIGHT, SCENE_HEIGHT, SCENE_WIDTH } from "./constants";
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
      height: NODE_HEIGHT,
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

export function getGraphSignature(steps: DiagramStep[], transitions: DiagramTransition[]) {
  const stepSignature = [...steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => `${step.id}:${step.step_order}:${step.name}:${step.process_area}:${step.node_type ?? "procedure"}:${step.canvas_x ?? "auto"}:${step.canvas_y ?? "auto"}:${step.wafers.length}`)
    .join("|");
  const transitionSignature = [...transitions]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((transition) => `${transition.id}:${transition.from_step_id}:${transition.to_step_id}:${transition.edge_type}`)
    .join("|");

  return `${stepSignature}::${transitionSignature}`;
}
