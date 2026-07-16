import type { FlowNode, WaferPin } from "./types";

export function areWafersArchivable(wafers: readonly Pick<WaferPin, "isArchivable">[]) {
  return wafers.length > 0 && wafers.every((wafer) => wafer.isArchivable === true);
}

export function isClientPointInsideRect(
  point: { x: number; y: number },
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">
) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

export function getBeginningLaneRestoreTarget(
  nodes: readonly FlowNode[],
  point: { x: number; y: number }
) {
  return nodes.find((node) => (
    point.x >= node.x &&
    point.x <= node.x + node.width / 2 &&
    point.y >= node.y &&
    point.y <= node.y + node.height
  )) ?? null;
}
