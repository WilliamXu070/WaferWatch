import type { Json } from "@/types/database";

export const dieDetailTabs = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Process History" }
] as const;

export type DieDetailTab = (typeof dieDetailTabs)[number]["id"];

export const waferDieNotesSurface = {
  scopeType: "wireframe:wafer_die",
  fieldKey: "notes"
} as const;

export function getWaferDieNotesScopeKey(waferId: string, dieLabel: string) {
  return `${waferId}:${dieLabel}`;
}

export function getWaferDieStepNotesScopeKey(waferId: string, dieLabel: string, stepId: string) {
  return `${getWaferDieNotesScopeKey(waferId, dieLabel)}:step:${stepId}`;
}

export function isPolingStepName(stepName: string) {
  return stepName.toLowerCase().includes("poling");
}

export function isInspectionStepName(stepName: string) {
  return /\b(inspection|inspect|test|characterization)\b/i.test(stepName);
}

export type HistoryWorkspaceCapability = "generic" | "poling" | "inspection";

/**
 * New step schemas can name the status workspace directly. Older process
 * templates keep their current Poling/Inspection behavior via the fallback.
 */
export function getHistoryWorkspaceCapability({
  stepName,
  processArea,
  parametersSchema
}: {
  stepName: string;
  processArea: string;
  parametersSchema?: Json;
}): HistoryWorkspaceCapability {
  const schema = parametersSchema && typeof parametersSchema === "object" && !Array.isArray(parametersSchema)
    ? parametersSchema as Record<string, unknown>
    : null;
  const configured = schema?.historyWorkspace;
  if (configured === "poling" || configured === "inspection" || configured === "generic") {
    return configured;
  }

  const legacyLabel = `${stepName} ${processArea}`;
  if (isPolingStepName(legacyLabel)) return "poling";
  if (isInspectionStepName(legacyLabel)) return "inspection";
  return "generic";
}

export const processTimeline = [
  { step: 1, title: "Wafer cleaning", time: "Jun 28, 9:10 AM", state: "complete" },
  { step: 2, title: "Lithography", time: "Jun 28, 11:05 AM", state: "complete" },
  { step: 3, title: "Etch - Waveguide", time: "Jun 28, 1:20 PM", state: "complete" },
  { step: 4, title: "Fixture poling", time: "In progress", state: "active" },
  { step: 5, title: "Anneal", time: "Pending", state: "pending" },
  { step: 6, title: "Metal deposition", time: "Pending", state: "pending" },
  { step: 7, title: "Passivation", time: "Pending", state: "pending" },
  { step: 8, title: "Test & Inspection", time: "Pending", state: "pending" }
] as const;

export const parameterRows = [
  ["Poling voltage", "+4.5 kV"],
  ["Poling temperature", "85 C"],
  ["Poling time", "30 min"],
  ["Ramp rate", "2 C/min"],
  ["Electrode type", "Au"],
  ["Atmosphere", "N2"],
  ["Fixture ID", "FIX-023"]
] as const;

export const pulseResults = [
  "18.2 dB",
  "18.7 dB",
  "19.1 dB",
  "20.4 dB",
  "20.1 dB",
  "20.8 dB",
  "21.3 dB",
  "21.7 dB",
  "20.9 dB",
  "20.2 dB"
] as const;

export const trendPoints = [
  [0, 70],
  [10, 64],
  [20, 60],
  [30, 56],
  [40, 49],
  [50, 45],
  [60, 38],
  [70, 34],
  [80, 42],
  [90, 48],
  [100, 58]
] as const;
