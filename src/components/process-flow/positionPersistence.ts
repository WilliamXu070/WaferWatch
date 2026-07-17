type CanvasPosition = {
  x: number;
  y: number;
};

type CanvasNodeBounds = CanvasPosition & {
  width: number;
  height: number;
};

type QueuedCanvasPosition = {
  canvasX: number;
  canvasY: number;
  expectedCanvasX: number;
  expectedCanvasY: number;
};

export function getExpectedCanvasPosition({
  queued,
  inFlight,
  server
}: {
  queued?: QueuedCanvasPosition;
  inFlight?: QueuedCanvasPosition;
  server: CanvasPosition;
}) {
  if (queued) {
    return { x: queued.expectedCanvasX, y: queued.expectedCanvasY };
  }

  if (inFlight) {
    return { x: inFlight.canvasX, y: inFlight.canvasY };
  }

  return server;
}

export function getStableLayoutCenter(
  nodes: readonly CanvasNodeBounds[],
  fallback: CanvasPosition
) {
  if (nodes.length === 0) {
    return fallback;
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };
}

export function hasCanvasPositionChanged(
  previous: CanvasPosition | undefined,
  next: CanvasPosition
) {
  return !previous || previous.x !== next.x || previous.y !== next.y;
}

export function resolveCanvasPosition({
  local,
  server,
  protectedTarget
}: {
  local: CanvasPosition;
  server: CanvasPosition;
  protectedTarget?: CanvasPosition;
}) {
  if (!protectedTarget) {
    return { position: server, settled: false };
  }

  if (
    server.x === protectedTarget.x &&
    server.y === protectedTarget.y
  ) {
    return { position: server, settled: true };
  }

  return { position: local, settled: false };
}

export function targetsSameCanvasPosition(
  first: CanvasPosition | undefined,
  second: CanvasPosition
) {
  return first?.x === second.x && first.y === second.y;
}
