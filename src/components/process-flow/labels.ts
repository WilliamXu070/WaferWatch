import type { ProcessStepNodeType } from "@/types/database";
import { MAX_SCALE, MIN_SCALE } from "./constants";
import type { FlowNode, FlowNodeRole, WaferPin } from "./types";

export function clampScale(nextScale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(nextScale.toFixed(2))));
}

export function toFlowNodeRole(nodeType: ProcessStepNodeType | undefined): FlowNodeRole {
  if (nodeType === "start" || nodeType === "end") {
    return nodeType;
  }

  return "normal";
}

export function toProcessStepNodeType(role: FlowNodeRole): ProcessStepNodeType {
  return role === "normal" ? "procedure" : role;
}

export function describeRole(role: FlowNodeRole) {
  if (role === "start") return "Start";
  if (role === "end") return "End";
  return "Step";
}

export function truncateLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

export function getVisibleNodeSubtitle(label: string, subLabel: string) {
  const normalizedLabel = normalizeDisplayText(label);
  const normalizedSubLabel = normalizeDisplayText(subLabel);

  if (!normalizedSubLabel || normalizedSubLabel === normalizedLabel) {
    return null;
  }

  return subLabel;
}

function normalizeDisplayText(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function getWaferChipLabel(wafer: WaferPin) {
  return wafer.dieLabel?.trim() || wafer.waferCode;
}

export function getNodeIconPath(role: FlowNodeRole) {
  if (role === "start") {
    return "M 18 8 A 10 10 0 1 1 17.9 8 M 15 13 L 22 18 L 15 23 Z";
  }

  if (role === "end") {
    return "M 10 11 H 26 V 25 H 10 Z M 14 15 H 22 M 14 19 H 22";
  }

  return "M 9 24 L 17 10 L 27 24 Z M 14 21 H 22 M 18 16 V 21";
}

export function hasActiveWafer(node: FlowNode) {
  return node.role === "normal" && node.wafers.some((wafer) => wafer.currentStepStatus === "running");
}

export function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}
