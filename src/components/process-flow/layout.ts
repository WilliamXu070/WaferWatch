import {
  LAYOUT_CENTER_X,
  LAYOUT_GAP_Y,
  LAYOUT_LANE_GAP_X,
  LAYOUT_LOOP_GAP_X,
  LAYOUT_LOOP_RADIUS_X,
  LAYOUT_LOOP_RADIUS_Y,
  LAYOUT_TOP_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
  SCENE_HEIGHT,
  SCENE_WIDTH
} from "./constants";
import type { FlowEdge, FlowNode, FlowNodeRole, ScenePoint } from "./types";

type LayoutComponent = {
  id: string;
  nodeIds: string[];
  order: number;
  width: number;
  height: number;
  hasStart: boolean;
  hasEnd: boolean;
};

export function autoLayoutNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  targetCenter: ScenePoint = { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }
) {
  if (nodes.length === 0) {
    return nodes;
  }

  const orderedIds = orderNodes(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const components = buildLayoutComponents(nodes, edges, orderedIds);
  const componentByNodeId = new Map<string, string>();
  const componentById = new Map(components.map((component) => [component.id, component]));
  const componentRank = new Map(components.map((component) => [component.id, 0]));
  const incomingCount = new Map(components.map((component) => [component.id, 0]));
  const outgoing = new Map(components.map((component) => [component.id, [] as string[]]));

  for (const component of components) {
    for (const nodeId of component.nodeIds) {
      componentByNodeId.set(nodeId, component.id);
    }
  }

  for (const edge of edges) {
    const fromComponentId = componentByNodeId.get(edge.from);
    const toComponentId = componentByNodeId.get(edge.to);

    if (!fromComponentId || !toComponentId || fromComponentId === toComponentId) {
      continue;
    }

    const nextComponents = outgoing.get(fromComponentId);
    if (nextComponents && !nextComponents.includes(toComponentId)) {
      nextComponents.push(toComponentId);
      incomingCount.set(toComponentId, (incomingCount.get(toComponentId) ?? 0) + 1);
    }
  }

  const explicitStartComponentIds = components
    .filter((component) => component.nodeIds.some((nodeId) => nodeById.get(nodeId)?.role === "start"))
    .map((component) => component.id);
  const rootComponentIds = components
    .filter((component) => (incomingCount.get(component.id) ?? 0) === 0)
    .map((component) => component.id);
  const seedIds = explicitStartComponentIds.length
    ? explicitStartComponentIds
    : rootComponentIds.length
      ? rootComponentIds
      : components.slice(0, 1).map((component) => component.id);
  const visited = new Set<string>();

  const assignRanks = (componentId: string, rank: number, activePath: Set<string>) => {
    const currentRank = componentRank.get(componentId) ?? 0;
    componentRank.set(componentId, Math.max(currentRank, rank));

    if (activePath.has(componentId)) {
      return;
    }

    const nextPath = new Set(activePath);
    nextPath.add(componentId);
    visited.add(componentId);

    const nextIds = (outgoing.get(componentId) ?? []).sort(
      (a, b) => (componentById.get(a)?.order ?? 0) - (componentById.get(b)?.order ?? 0)
    );

    for (const nextId of nextIds) {
      if (nextPath.has(nextId)) {
        continue;
      }

      assignRanks(nextId, rank + 1, nextPath);
    }
  };

  seedIds.forEach((id) => assignRanks(id, 0, new Set()));

  let disconnectedRank = 0;
  for (const component of components) {
    if (visited.has(component.id)) {
      disconnectedRank = Math.max(disconnectedRank, componentRank.get(component.id) ?? 0);
      continue;
    }

    assignRanks(component.id, disconnectedRank + 1, new Set());
    disconnectedRank = Math.max(disconnectedRank, componentRank.get(component.id) ?? 0);
  }

  normalizeComponentRanks(components, componentRank);

  const lanesByRank = new Map<number, LayoutComponent[]>();
  for (const component of components) {
    const rank = componentRank.get(component.id) ?? 0;
    const current = lanesByRank.get(rank);
    if (current) {
      current.push(component);
    } else {
      lanesByRank.set(rank, [component]);
    }
  }

  const positioned = new Map<string, FlowNode>();
  let rowY = LAYOUT_TOP_Y;

  for (const rank of [...lanesByRank.keys()].sort((a, b) => a - b)) {
    const rowComponents = (lanesByRank.get(rank) ?? []).sort(compareLayoutComponents);
    const rowHeight = Math.max(...rowComponents.map((component) => component.height));
    const rowWidth = rowComponents.reduce((width, component) => width + component.width, 0) +
      Math.max(0, rowComponents.length - 1) * LAYOUT_LANE_GAP_X;
    let componentX = Math.max(96, Math.round(LAYOUT_CENTER_X - rowWidth / 2));

    for (const component of rowComponents) {
      const componentY = Math.round(rowY + (rowHeight - component.height) / 2);
      positionComponentNodes(component, nodeById, edges, componentX, componentY, positioned);
      componentX += component.width + LAYOUT_LANE_GAP_X;
    }

    rowY += rowHeight + LAYOUT_GAP_Y;
  }

  centerPositionedNodes(positioned, targetCenter);

  return applyGraphDisplayOrder(nodes.map((node) => positioned.get(node.id) ?? node), edges);
}

export function applyGraphDisplayOrder(nodes: FlowNode[], edges: FlowEdge[]) {
  const orderedIds = orderNodes(nodes, edges.filter((edge) => edge.kind !== "return"));
  const orderById = new Map(orderedIds.map((id, index) => [id, index + 1]));

  return nodes.map((node) => ({
    ...node,
    order: orderById.get(node.id) ?? node.order
  }));
}

function orderNodes(nodes: FlowNode[], edges: FlowEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }

    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const orderedNodes = [...nodes].sort((a, b) => a.order - b.order);
  const visited = new Set<string>();
  const sortedIds: string[] = [];
  const roots = orderedNodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const starts = roots.length ? roots : orderedNodes.slice(0, 1);

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    sortedIds.push(nodeId);

    for (const nextId of outgoing.get(nodeId) ?? []) {
      visit(nextId);
    }
  };

  starts.forEach((node) => visit(node.id));

  const missing = nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.order - b.order)
    .map((node) => node.id);

  return [...sortedIds, ...missing];
}

function centerPositionedNodes(positioned: Map<string, FlowNode>, targetCenter: ScenePoint) {
  const positionedNodes = [...positioned.values()];
  if (positionedNodes.length === 0) {
    return;
  }

  const minX = Math.min(...positionedNodes.map((node) => node.x));
  const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width));
  const minY = Math.min(...positionedNodes.map((node) => node.y));
  const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height));
  const currentCenterX = (minX + maxX) / 2;
  const currentCenterY = (minY + maxY) / 2;
  let dx = Math.round(targetCenter.x - currentCenterX);
  let dy = Math.round(targetCenter.y - currentCenterY);

  if (minX + dx < 24) {
    dx = 24 - minX;
  }

  if (minY + dy < 24) {
    dy = 24 - minY;
  }

  for (const [id, node] of positioned) {
    positioned.set(id, {
      ...node,
      x: Math.round(node.x + dx),
      y: Math.round(node.y + dy)
    });
  }
}

function buildLayoutComponents(nodes: FlowNode[], edges: FlowEdge[], orderedIds: string[]): LayoutComponent[] {
  const orderIndexById = new Map(orderedIds.map((id, index) => [id, index]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const stronglyConnected = getStronglyConnectedComponents(nodes, edges, orderIndexById);

  return stronglyConnected
    .map((nodeIds, index) => {
      const sortedNodeIds = [...nodeIds].sort((a, b) =>
        compareNodeIdsForLayout(a, b, nodeById, orderIndexById)
      );
      const hasStart = sortedNodeIds.some((id) => nodeById.get(id)?.role === "start");
      const hasEnd = sortedNodeIds.some((id) => nodeById.get(id)?.role === "end");
      const dimensions = getComponentDimensions(sortedNodeIds, nodeById, hasStart || hasEnd);

      return {
        id: `component-${index}`,
        nodeIds: sortedNodeIds,
        order: Math.min(...sortedNodeIds.map((id) => orderIndexById.get(id) ?? 0)),
        width: dimensions.width,
        height: dimensions.height,
        hasStart,
        hasEnd
      };
    })
    .sort(compareLayoutComponents);
}

function normalizeComponentRanks(components: LayoutComponent[], componentRank: Map<string, number>) {
  const startComponents = components.filter((component) => component.hasStart);
  const endComponents = components.filter((component) => component.hasEnd);

  for (const component of startComponents) {
    componentRank.set(component.id, 0);
  }

  const maxNonEndRank = components
    .filter((component) => !component.hasEnd)
    .reduce((maxRank, component) => Math.max(maxRank, componentRank.get(component.id) ?? 0), 0);

  for (const component of endComponents) {
    if (component.hasStart) {
      continue;
    }

    componentRank.set(component.id, maxNonEndRank + 1);
  }
}

function compareLayoutComponents(a: LayoutComponent, b: LayoutComponent) {
  const roleDelta = getComponentRoleSortWeight(a) - getComponentRoleSortWeight(b);
  if (roleDelta !== 0) {
    return roleDelta;
  }

  return a.order - b.order;
}

function getComponentRoleSortWeight(component: LayoutComponent) {
  if (component.hasStart) return -1;
  if (component.hasEnd) return 1;
  return 0;
}

function compareNodeIdsForLayout(
  a: string,
  b: string,
  nodeById: Map<string, FlowNode>,
  orderIndexById: Map<string, number>
) {
  const roleDelta = getNodeRoleSortWeight(nodeById.get(a)?.role ?? "normal") -
    getNodeRoleSortWeight(nodeById.get(b)?.role ?? "normal");
  if (roleDelta !== 0) {
    return roleDelta;
  }

  return (orderIndexById.get(a) ?? 0) - (orderIndexById.get(b) ?? 0);
}

function getNodeRoleSortWeight(role: FlowNodeRole) {
  if (role === "start") return -1;
  if (role === "end") return 1;
  return 0;
}

function getStronglyConnectedComponents(
  nodes: FlowNode[],
  edges: FlowEdge[],
  orderIndexById: Map<string, number>
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      outgoing.get(edge.from)?.push(edge.to);
    }
  }

  for (const nextIds of outgoing.values()) {
    nextIds.sort((a, b) => (orderIndexById.get(a) ?? 0) - (orderIndexById.get(b) ?? 0));
  }

  let index = 0;
  const stack: string[] = [];
  const stackSet = new Set<string>();
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const components: string[][] = [];

  const visit = (nodeId: string) => {
    indexById.set(nodeId, index);
    lowLinkById.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    stackSet.add(nodeId);

    for (const nextId of outgoing.get(nodeId) ?? []) {
      if (!indexById.has(nextId)) {
        visit(nextId);
        lowLinkById.set(nodeId, Math.min(lowLinkById.get(nodeId) ?? 0, lowLinkById.get(nextId) ?? 0));
      } else if (stackSet.has(nextId)) {
        lowLinkById.set(nodeId, Math.min(lowLinkById.get(nodeId) ?? 0, indexById.get(nextId) ?? 0));
      }
    }

    if (lowLinkById.get(nodeId) !== indexById.get(nodeId)) {
      return;
    }

    const component: string[] = [];
    let currentId: string | undefined;
    do {
      currentId = stack.pop();
      if (currentId) {
        stackSet.delete(currentId);
        component.push(currentId);
      }
    } while (currentId && currentId !== nodeId);

    components.push(component);
  };

  for (const node of [...nodes].sort((a, b) => a.order - b.order)) {
    if (!indexById.has(node.id)) {
      visit(node.id);
    }
  }

  return components;
}

function getComponentDimensions(
  nodeIds: string[],
  nodeById: Map<string, FlowNode>,
  hasPinnedRole: boolean
) {
  const nodeCount = nodeIds.length;
  const maxNodeHeight = Math.max(NODE_HEIGHT, ...nodeIds.map((id) => nodeById.get(id)?.height ?? NODE_HEIGHT));

  if (nodeCount <= 1) {
    return { width: NODE_WIDTH, height: maxNodeHeight };
  }

  if (nodeCount === 2 && !hasPinnedRole) {
    return {
      width: NODE_WIDTH * 2 + LAYOUT_LOOP_GAP_X,
      height: maxNodeHeight
    };
  }

  return {
    width: LAYOUT_LOOP_RADIUS_X * 2 + NODE_WIDTH,
    height: LAYOUT_LOOP_RADIUS_Y * 2 + maxNodeHeight
  };
}

function positionComponentNodes(
  component: LayoutComponent,
  nodeById: Map<string, FlowNode>,
  edges: FlowEdge[],
  componentX: number,
  componentY: number,
  positioned: Map<string, FlowNode>
) {
  if (component.nodeIds.length === 1) {
    const node = nodeById.get(component.nodeIds[0]);
    if (node) {
      positioned.set(node.id, { ...node, x: Math.round(componentX), y: Math.round(componentY) });
    }
    return;
  }

  if (component.nodeIds.length === 2 && !component.hasStart && !component.hasEnd) {
    component.nodeIds.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) {
        return;
      }

      positioned.set(id, {
        ...node,
        x: Math.round(componentX + index * (NODE_WIDTH + LAYOUT_LOOP_GAP_X)),
        y: Math.round(componentY)
      });
    });
    return;
  }

  const pinnedPositions = getPinnedComponentPositions(component, nodeById);
  const centerX = componentX + component.width / 2;
  const centerY = componentY + component.height / 2;
  const placementNodeIds = getComponentPlacementNodeIds(component, nodeById, edges);
  const freeNodeIds = placementNodeIds.filter((id) => !pinnedPositions.has(id));

  for (const [id, point] of pinnedPositions) {
    const node = nodeById.get(id);
    if (!node) {
      continue;
    }

    positioned.set(id, {
      ...node,
      x: Math.round(componentX + point.x - NODE_WIDTH / 2),
      y: Math.round(componentY + point.y - node.height / 2)
    });
  }

  freeNodeIds.forEach((id, index) => {
    const node = nodeById.get(id);
    if (!node) {
      return;
    }

    if (component.hasStart || component.hasEnd) {
      const point = getPinnedRoleFreeNodePoint(component, nodeById, index, freeNodeIds.length);
      positioned.set(id, {
        ...node,
        x: Math.round(componentX + point.x - NODE_WIDTH / 2),
        y: Math.round(componentY + point.y - node.height / 2)
      });
      return;
    }

    const angle = getFreeNodeAngle(index, freeNodeIds.length);
    positioned.set(id, {
      ...node,
      x: Math.round(centerX + Math.cos(angle) * LAYOUT_LOOP_RADIUS_X - NODE_WIDTH / 2),
      y: Math.round(centerY + Math.sin(angle) * LAYOUT_LOOP_RADIUS_Y - node.height / 2)
    });
  });
}

function getPinnedComponentPositions(component: LayoutComponent, nodeById: Map<string, FlowNode>) {
  const pinned = new Map<string, { x: number; y: number }>();
  const centerX = component.width / 2;

  const startId = component.nodeIds.find((id) => nodeById.get(id)?.role === "start");
  if (startId) {
    const startNode = nodeById.get(startId);
    pinned.set(startId, { x: centerX, y: (startNode?.height ?? NODE_HEIGHT) / 2 });
  }

  const endId = component.nodeIds.find((id) => nodeById.get(id)?.role === "end");
  if (endId && endId !== startId) {
    const endNode = nodeById.get(endId);
    pinned.set(endId, { x: centerX, y: component.height - (endNode?.height ?? NODE_HEIGHT) / 2 });
  }

  return pinned;
}

function getComponentPlacementNodeIds(component: LayoutComponent, nodeById: Map<string, FlowNode>, edges: FlowEdge[]) {
  const componentNodeIds = new Set(component.nodeIds);
  const startId = component.nodeIds.find((id) => nodeById.get(id)?.role === "start") ?? component.nodeIds[0];

  if (!startId || component.nodeIds.length < 2) {
    return component.nodeIds;
  }

  const componentOrder = new Map(component.nodeIds.map((id, index) => [id, index]));
  const outgoing = new Map(component.nodeIds.map((id) => [id, [] as string[]]));

  for (const edge of edges) {
    if (componentNodeIds.has(edge.from) && componentNodeIds.has(edge.to)) {
      outgoing.get(edge.from)?.push(edge.to);
    }
  }

  for (const nextIds of outgoing.values()) {
    nextIds.sort((a, b) => (componentOrder.get(a) ?? 0) - (componentOrder.get(b) ?? 0));
  }

  const ordered = [startId];
  const visited = new Set(ordered);
  let currentId = startId;

  while (true) {
    const nextId = (outgoing.get(currentId) ?? []).find((id) => !visited.has(id));
    if (!nextId) {
      break;
    }

    ordered.push(nextId);
    visited.add(nextId);
    currentId = nextId;
  }

  for (const id of component.nodeIds) {
    if (!visited.has(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

function getPinnedRoleFreeNodePoint(
  component: LayoutComponent,
  nodeById: Map<string, FlowNode>,
  index: number,
  count: number
) {
  const side = index % 2 === 0 ? -1 : 1;
  const sideIndex = Math.floor(index / 2);
  const sideCount = Math.ceil(count / 2);
  const hasBothRoles = component.hasStart && component.hasEnd;
  const topPadding = component.hasStart ? getPinnedNodeHeight(component, nodeById, "start") : NODE_HEIGHT / 2;
  const bottomPadding = component.hasEnd ? getPinnedNodeHeight(component, nodeById, "end") : NODE_HEIGHT / 2;
  const usableHeight = Math.max(NODE_HEIGHT, component.height - topPadding - bottomPadding);
  const yGap = hasBothRoles
    ? usableHeight / Math.max(1, sideCount + 1)
    : usableHeight / Math.max(1, sideCount);

  return {
    x: component.width / 2 + side * LAYOUT_LOOP_RADIUS_X,
    y: topPadding + yGap * (sideIndex + (hasBothRoles ? 1 : 0.5))
  };
}

function getPinnedNodeHeight(
  component: LayoutComponent,
  nodeById: Map<string, FlowNode>,
  role: FlowNodeRole
) {
  const nodeId = component.nodeIds.find((id) => nodeById.get(id)?.role === role);
  return nodeId ? nodeById.get(nodeId)?.height ?? NODE_HEIGHT : NODE_HEIGHT;
}

function getFreeNodeAngle(index: number, count: number) {
  if (count <= 1) {
    return Math.PI;
  }

  return -Math.PI / 2 + (index * Math.PI * 2) / count;
}
