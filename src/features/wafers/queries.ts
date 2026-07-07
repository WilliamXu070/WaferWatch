import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, FabricationStatus, ProcessStep, StepExecution, StepStatus, WaferProcessAssignment } from "@/types/database";
import type {
  DiePolingRows,
  WaferDisplayMode,
  WaferFamilyModel,
  WaferFamilyStatus,
  WaferStatusMetric,
  WaferStatusModel,
  WaferStatusTileModel,
  WaferTileStatus
} from "@/ui/waferwatch-wireframe/types";
import {
  getWaferDieNotesScopeKey,
  getWaferDieStepNotesScopeKey,
  waferDieNotesSurface
} from "@/ui/waferwatch-wireframe/components/wafer-die-detail/waferDieDetailData";

type JsonRecord = { [key: string]: Json | undefined };
type DiePolingParameters = Record<string, DiePolingRows>;

type WaferStatusWaferRow = {
  id: string;
  project_id: string;
  wafer_code: string;
  status: FabricationStatus;
  notes: string | null;
  metadata: Json;
  created_at: string;
};

type WaferStatusTextSurfaceRow = {
  project_id: string;
  scope_type: string;
  scope_key: string;
  field_key: string;
  value: string;
};

type WaferStatusAssignmentRow = Pick<
  WaferProcessAssignment,
  "id" | "wafer_id" | "status" | "assigned_at" | "started_at" | "completed_at"
>;

type WaferStatusExecutionRow = Pick<
  StepExecution,
  "id" | "assignment_id" | "process_step_id" | "status" | "created_at" | "started_at" | "completed_at"
>;

type WaferStatusStepRow = Pick<ProcessStep, "id" | "template_id" | "name" | "process_area" | "step_order">;

const ACTIVE_ASSIGNMENT_STATUSES: FabricationStatus[] = ["planned", "queued", "in_progress", "on_hold"];
const DIE_POLING_PARAMETERS_KEY = "die_poling_parameters";

function toJsonRecord(metadata: Json): JsonRecord {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function getRecord(record: JsonRecord, key: string): JsonRecord | null {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function readDiePolingParameters(metadata: Json): DiePolingParameters {
  const root = toJsonRecord(metadata);
  const value = root[DIE_POLING_PARAMETERS_KEY];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DiePolingParameters)
    : {};
}

function getString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBoolean(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function normalizeWaferMode(value: string): WaferDisplayMode | null {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");

  if (["undiced", "predice", "pre"].includes(normalized)) {
    return "undiced";
  }

  if (["diced", "postdice", "post"].includes(normalized)) {
    return "diced";
  }

  return null;
}

function readMetadataFamily(metadata: Json) {
  const root = toJsonRecord(metadata);
  const viewer = getRecord(root, "viewer") ?? getRecord(root, "wafer_viewer") ?? getRecord(root, "wafer_status");

  return (
    getString(root, "wafer_family") ??
    getString(root, "family") ??
    getString(root, "family_code") ??
    (viewer ? getString(viewer, "family") ?? getString(viewer, "wafer_family") : null)
  );
}

function deriveFamily(waferCode: string, metadata: Json) {
  const metadataFamily = readMetadataFamily(metadata);
  if (metadataFamily) {
    return metadataFamily.toUpperCase();
  }

  const code = waferCode.trim().toUpperCase();
  const leadingFamily = code.match(/^[A-Z]+/)?.[0];
  return leadingFamily || "WAFERS";
}

function readMetadataMode(metadata: Json): WaferDisplayMode | null {
  const root = toJsonRecord(metadata);
  const viewer = getRecord(root, "viewer") ?? getRecord(root, "wafer_viewer") ?? getRecord(root, "wafer_status");
  const mode =
    getString(root, "wafer_display_mode") ??
    getString(root, "wafer_mode") ??
    getString(root, "dice_state") ??
    getString(root, "dicing_state") ??
    (viewer ? getString(viewer, "mode") ?? getString(viewer, "wafer_mode") : null);

  if (mode) {
    const normalizedMode = normalizeWaferMode(mode);
    if (normalizedMode) {
      return normalizedMode;
    }
  }

  const isUndiced = getBoolean(root, "is_undiced") ?? (viewer ? getBoolean(viewer, "is_undiced") : null);
  if (isUndiced !== null) {
    return isUndiced ? "undiced" : "diced";
  }

  const isDiced = getBoolean(root, "is_diced") ?? getBoolean(root, "diced") ?? (viewer ? getBoolean(viewer, "is_diced") : null);
  if (isDiced !== null) {
    return isDiced ? "diced" : "undiced";
  }

  return null;
}

function extractDieLabel(metadata: Json): string | null {
  const root = toJsonRecord(metadata);
  const candidate =
    getString(root, "current_die") ??
    getString(root, "die") ??
    getString(root, "chip") ??
    getString(root, "chip_id") ??
    getString(root, "die_id");

  return candidate ?? null;
}

function deriveWaferMode(metadata: Json, dieLabel: string | null): WaferDisplayMode {
  return readMetadataMode(metadata) ?? (dieLabel ? "diced" : "undiced");
}

function deriveStepStatusRank(status: StepStatus) {
  if (status === "running") return 0;
  if (status === "blocked") return 1;
  if (status === "failed") return 2;
  if (status === "queued") return 3;
  if (status === "pending") return 4;
  return 9;
}

function pickCurrentStepExecution(executions: ReadonlyArray<WaferStatusExecutionRow>) {
  const prioritized = executions
    .filter((execution) => ["running", "blocked", "failed", "queued", "pending"].includes(execution.status))
    .sort((a, b) => {
      const statusRank = deriveStepStatusRank(a.status) - deriveStepStatusRank(b.status);
      if (statusRank !== 0) {
        return statusRank;
      }

      return new Date(b.started_at ?? b.created_at).getTime() - new Date(a.started_at ?? a.created_at).getTime();
    });

  if (prioritized[0]) {
    return prioritized[0];
  }

  return executions
    .filter((execution) => execution.status === "completed" || execution.status === "skipped")
    .sort((a, b) => {
      const timeA = new Date(a.completed_at ?? a.started_at ?? a.created_at).getTime();
      const timeB = new Date(b.completed_at ?? b.started_at ?? b.created_at).getTime();
      return timeB - timeA;
    })[0];
}

function mapTileStatus({
  waferStatus,
  currentStep,
  currentStepStatus
}: {
  waferStatus: FabricationStatus;
  currentStep: WaferStatusStepRow | null;
  currentStepStatus: StepStatus | null;
}): WaferTileStatus {
  if (currentStepStatus === "queued" || currentStepStatus === "pending" || waferStatus === "planned" || waferStatus === "queued") {
    return "queued";
  }

  const stepText = `${currentStep?.name ?? ""} ${currentStep?.process_area ?? ""}`.toLowerCase();
  if (stepText.includes("dice") || stepText.includes("dicing")) return "dice";
  if (stepText.includes("bond")) return "bond";
  if (stepText.includes("etch")) return "etch";
  if (stepText.includes("litho") || stepText.includes("expose")) return "litho";
  if (stepText.includes("test") || stepText.includes("probe") || stepText.includes("characterization")) return "test";
  if (stepText.includes("inspect") || stepText.includes("metrology") || stepText.includes("scan")) return "inspection";

  if (waferStatus === "completed") return "test";
  return "queued";
}

function formatStepLabel({
  waferStatus,
  currentStep
}: {
  waferStatus: FabricationStatus;
  currentStep: WaferStatusStepRow | null;
}) {
  if (currentStep?.name) {
    return currentStep.name;
  }

  const labelByStatus: Record<FabricationStatus, string> = {
    planned: "Planned",
    queued: "Queued",
    in_progress: "In progress",
    on_hold: "On hold",
    completed: "Complete",
    scrapped: "Scrapped"
  };

  return labelByStatus[waferStatus];
}

function deriveFamilyStatus(wafers: WaferStatusWaferRow[], tiles: WaferStatusTileModel[]): WaferFamilyStatus {
  if (wafers.every((wafer) => wafer.status === "planned" || wafer.status === "queued")) {
    return "setup";
  }

  if (wafers.every((wafer) => wafer.status === "on_hold")) {
    return "paused";
  }

  if (tiles.every((tile) => tile.status === "queued")) {
    return "setup";
  }

  return "active";
}

function buildMetrics(wafers: WaferStatusWaferRow[]): WaferStatusMetric[] {
  const activeCount = wafers.filter((wafer) => ["planned", "queued", "in_progress", "on_hold"].includes(wafer.status)).length;
  const runningCount = wafers.filter((wafer) => wafer.status === "in_progress").length;
  const completedCount = wafers.filter((wafer) => wafer.status === "completed").length;
  const yieldValue = wafers.length ? `${Math.round((completedCount / wafers.length) * 100)}%` : "0%";

  return [
    { id: "wafers", label: "Wafers", value: String(wafers.length), tone: "neutral" },
    { id: "active", label: "Active", value: String(activeCount), tone: "active" },
    { id: "progress", label: "In progress", value: String(runningCount), tone: "running" },
    { id: "yield", label: "Yield", value: yieldValue, tone: "yield" }
  ];
}

function getNotesSurfaceMapKey({
  projectId,
  scopeKey
}: {
  projectId: string;
  scopeKey: string;
}) {
  return [
    projectId,
    waferDieNotesSurface.scopeType,
    scopeKey,
    waferDieNotesSurface.fieldKey
  ].join(":");
}

function mapWafersToStatusModel({
  wafers,
  assignmentsByWaferId,
  executionsByAssignmentId,
  stepsById,
  processSteps,
  textSurfacesByKey
}: {
  wafers: WaferStatusWaferRow[];
  assignmentsByWaferId: Map<string, WaferStatusAssignmentRow>;
  executionsByAssignmentId: Map<string, WaferStatusExecutionRow[]>;
  stepsById: Map<string, WaferStatusStepRow>;
  processSteps: WaferStatusStepRow[];
  textSurfacesByKey: Map<string, WaferStatusTextSurfaceRow>;
}): WaferStatusModel {
  const familyBuckets = new Map<string, { wafers: WaferStatusWaferRow[]; tiles: WaferStatusTileModel[] }>();
  const tiles: WaferStatusTileModel[] = [];

  for (const wafer of wafers) {
    const assignment = assignmentsByWaferId.get(wafer.id) ?? null;
    const assignmentExecutions = assignment ? executionsByAssignmentId.get(assignment.id) ?? [] : [];
    if (assignment?.status === "planned" && assignmentExecutions.length === 0) {
      continue;
    }

    const currentExecution = assignment ? pickCurrentStepExecution(assignmentExecutions) : null;
    const currentStep = currentExecution ? stepsById.get(currentExecution.process_step_id) ?? null : null;
    const executionsByStepId = new Map(
      assignmentExecutions.map((execution) => [execution.process_step_id, execution])
    );
    const dieLabel = extractDieLabel(wafer.metadata);
    const mode = deriveWaferMode(wafer.metadata, dieLabel);
    const family = deriveFamily(wafer.wafer_code, wafer.metadata);
    const displayDieLabel = dieLabel ?? wafer.wafer_code;
    const notesScopeKey = getWaferDieNotesScopeKey(wafer.id, displayDieLabel);
    const notesSurface = textSurfacesByKey.get(
      getNotesSurfaceMapKey({
        projectId: wafer.project_id,
        scopeKey: notesScopeKey
      })
    );
    const notesSurfaceValuesByStepId = Object.fromEntries(
      processSteps.map((step) => {
        const stepNotesSurface = textSurfacesByKey.get(
          getNotesSurfaceMapKey({
            projectId: wafer.project_id,
            scopeKey: getWaferDieStepNotesScopeKey(wafer.id, displayDieLabel, step.id)
          })
        );

        return [step.id, stepNotesSurface?.value ?? null];
      })
    );
    const status = mapTileStatus({
      waferStatus: wafer.status,
      currentStep,
      currentStepStatus: currentExecution?.status ?? null
    });
    const tile: WaferStatusTileModel = {
      id: wafer.id,
      projectId: wafer.project_id,
      waferId: wafer.id,
      code: mode === "undiced" ? wafer.wafer_code : displayDieLabel,
      family,
      dieLabel: displayDieLabel,
      stepLabel: formatStepLabel({ waferStatus: wafer.status, currentStep }),
      status,
      waferStateName: mode === "undiced" ? "pre-dice" : "post-dice",
      legacyNote: wafer.notes,
      notesSurfaceValue: notesSurface?.value ?? null,
      notesSurfaceValuesByStepId,
      currentStepId: currentStep?.id ?? null,
      currentStepExecutionId: currentExecution?.id ?? null,
      processSteps: processSteps.map((step) => {
        const execution = executionsByStepId.get(step.id) ?? null;

        return {
          id: step.id,
          name: step.name,
          processArea: step.process_area,
          stepOrder: step.step_order,
          status: execution?.status ?? "pending",
          executionId: execution?.id ?? null,
          startedAt: execution?.started_at ?? null,
          completedAt: execution?.completed_at ?? null,
          createdAt: execution?.created_at ?? null
        };
      }),
      mode,
      isUndiced: mode === "undiced",
      diePolingParameters: readDiePolingParameters(wafer.metadata)
    };

    tiles.push(tile);
    const bucket = familyBuckets.get(family);
    if (bucket) {
      bucket.wafers.push(wafer);
      bucket.tiles.push(tile);
    } else {
      familyBuckets.set(family, { wafers: [wafer], tiles: [tile] });
    }
  }

  const families: WaferFamilyModel[] = Array.from(familyBuckets.entries())
    .sort(([familyA], [familyB]) => familyA.localeCompare(familyB))
    .map(([family, bucket]) => ({
      id: family.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "wafers",
      name: family,
      status: deriveFamilyStatus(bucket.wafers, bucket.tiles),
      tiles: bucket.tiles
    }));

  const firstActiveTile = families
    .flatMap((family) => family.tiles)
    .find((tile) => tile.status !== "queued");
  const selectedTileId = firstActiveTile?.id ?? families[0]?.tiles[0]?.id ?? null;

  return {
    metrics: buildMetrics(wafers),
    families: families.map((family) => ({
      ...family,
      tiles: family.tiles.map((tile) => ({
        ...tile,
        isSelected: tile.id === selectedTileId
      }))
    }))
  };
}

export function getEmptyWaferStatusModel(): WaferStatusModel {
  return {
    metrics: buildMetrics([]),
    families: []
  };
}

export async function getWaferStatusModel(processTemplateId?: string): Promise<WaferStatusModel> {
  const supabase = await createServerSupabaseClient();

  const scopedAssignmentsResult = processTemplateId
    ? await supabase
        .from("wafer_process_assignments")
        .select("id, wafer_id, status, assigned_at, started_at, completed_at")
        .eq("template_id", processTemplateId)
        .in("status", ACTIVE_ASSIGNMENT_STATUSES)
        .order("assigned_at", { ascending: false })
    : null;

  if (scopedAssignmentsResult?.error) {
    throw scopedAssignmentsResult.error;
  }

  const scopedAssignments = (scopedAssignmentsResult?.data ?? []) as WaferStatusAssignmentRow[];
  const scopedWaferIds = processTemplateId
    ? Array.from(new Set(scopedAssignments.map((assignment) => assignment.wafer_id)))
    : null;

  if (processTemplateId && (!scopedWaferIds || scopedWaferIds.length === 0)) {
    return getEmptyWaferStatusModel();
  }

  const wafersQuery = supabase
    .from("wafers")
    .select("id, project_id, wafer_code, status, notes, metadata, created_at")
    .order("wafer_code", { ascending: true });

  const wafersResult = scopedWaferIds ? await wafersQuery.in("id", scopedWaferIds) : await wafersQuery;

  if (wafersResult.error) {
    throw wafersResult.error;
  }

  const wafers = (wafersResult.data ?? []) as WaferStatusWaferRow[];
  if (wafers.length === 0) {
    return getEmptyWaferStatusModel();
  }

  const waferIds = wafers.map((wafer) => wafer.id);
  const projectIds = Array.from(new Set(wafers.map((wafer) => wafer.project_id)));
  const textSurfacesResult = projectIds.length
    ? await supabase
        .from("text_surfaces")
        .select("project_id, scope_type, scope_key, field_key, value")
        .in("project_id", projectIds)
        .eq("scope_type", waferDieNotesSurface.scopeType)
        .eq("field_key", waferDieNotesSurface.fieldKey)
    : ({ data: [], error: null } as const);

  if (textSurfacesResult.error) {
    throw textSurfacesResult.error;
  }

  const textSurfacesByKey = new Map(
    ((textSurfacesResult.data ?? []) as WaferStatusTextSurfaceRow[]).map((surface) => [
      getNotesSurfaceMapKey({
        projectId: surface.project_id,
        scopeKey: surface.scope_key
      }),
      surface
    ])
  );

  const assignmentsResult = processTemplateId
    ? null
    : await supabase
        .from("wafer_process_assignments")
        .select("id, wafer_id, status, assigned_at, started_at, completed_at")
        .in("wafer_id", waferIds)
        .in("status", ACTIVE_ASSIGNMENT_STATUSES)
        .order("assigned_at", { ascending: false });

  if (assignmentsResult?.error) {
    throw assignmentsResult.error;
  }

  const assignments = processTemplateId
    ? scopedAssignments
    : (assignmentsResult?.data ?? []) as WaferStatusAssignmentRow[];

  const assignmentsByWaferId = new Map<string, WaferStatusAssignmentRow>();
  for (const assignment of assignments) {
    if (!assignmentsByWaferId.has(assignment.wafer_id)) {
      assignmentsByWaferId.set(assignment.wafer_id, assignment);
    }
  }

  const assignmentIds = Array.from(assignmentsByWaferId.values()).map((assignment) => assignment.id);
  const executionsResult = assignmentIds.length
    ? await supabase
        .from("step_executions")
        .select("id, assignment_id, process_step_id, status, created_at, started_at, completed_at")
        .in("assignment_id", assignmentIds)
    : ({ data: [], error: null } as const);

  if (executionsResult.error) {
    throw executionsResult.error;
  }

  const executions = (executionsResult.data ?? []) as WaferStatusExecutionRow[];
  const executionsByAssignmentId = new Map<string, WaferStatusExecutionRow[]>();
  for (const execution of executions) {
    const bucket = executionsByAssignmentId.get(execution.assignment_id);
    if (bucket) {
      bucket.push(execution);
    } else {
      executionsByAssignmentId.set(execution.assignment_id, [execution]);
    }
  }

  const executionStepIds = Array.from(new Set(executions.map((execution) => execution.process_step_id)));
  const stepsResult = processTemplateId
    ? await supabase
        .from("process_steps")
        .select("id, template_id, name, process_area, step_order")
        .eq("template_id", processTemplateId)
        .order("step_order", { ascending: true })
    : executionStepIds.length
      ? await supabase
          .from("process_steps")
          .select("id, template_id, name, process_area, step_order")
          .in("id", executionStepIds)
          .order("step_order", { ascending: true })
      : ({ data: [], error: null } as const);

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  const stepsById = new Map(
    ((stepsResult.data ?? []) as WaferStatusStepRow[]).map((step) => [step.id, step])
  );
  const processSteps = [...stepsById.values()].sort((a, b) => a.step_order - b.step_order);

  return mapWafersToStatusModel({
    wafers,
    assignmentsByWaferId,
    executionsByAssignmentId,
    stepsById,
    processSteps,
    textSurfacesByKey
  });
}

export async function listWafers(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafers")
    .select("*, wafer_lots(*)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getWafer(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafers")
    .select("*, wafer_lots(*), wafer_process_assignments(*)")
    .eq("id", waferId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getWaferTimeline(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const [steps, events, measurements, issues] = await Promise.all([
    supabase
      .from("step_executions")
      .select("*, process_steps(*), fabrication_tools(*), recipes(*)")
      .eq("wafer_id", waferId)
      .order("created_at", { ascending: true }),
    supabase
      .from("process_events")
      .select("*")
      .eq("wafer_id", waferId)
      .order("event_at", { ascending: true }),
    supabase
      .from("measurements")
      .select("*")
      .eq("wafer_id", waferId)
      .order("measured_at", { ascending: true }),
    supabase
      .from("process_issues")
      .select("*")
      .eq("wafer_id", waferId)
      .order("opened_at", { ascending: true })
  ]);

  for (const result of [steps, events, measurements, issues]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    steps: steps.data ?? [],
    events: events.data ?? [],
    measurements: measurements.data ?? [],
    issues: issues.data ?? []
  };
}
