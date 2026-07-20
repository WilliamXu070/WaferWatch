import "server-only";

import { orderProcessStepsByOccurrence } from "@/features/process-flows/step-order";
import { readStepParameterDefinitions } from "@/features/process-flows/stepParameters";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCheckpointRouteCorrectionState } from "@/features/process-flows/checkpointRouteCorrection";
import { getHistoryUndoState } from "@/features/process-flows/historyUndo";
import type {
  Json,
  FabricationStatus,
  ProcessStep,
  ProcessStepTransition,
  StepExecution,
  StepStatus,
  WaferProcessAssignment
} from "@/types/database";
import type {
  DiePolingRows,
  WaferDisplayMode,
  WaferFamilyModel,
  WaferFamilyStatus,
  WaferStatusCheckpointHistoryEntry,
  WaferStatusMetric,
  WaferStatusModel,
  WaferStatusRevertEvent,
  WaferStatusStepParameterRecord,
  WaferStatusTileModel,
  WaferTileStatus
} from "@/ui/waferwatch-wireframe/types";
import {
  buildCheckpointTimeline,
  mergeCheckpointTimelineLineage,
  type CheckpointTimelineAttemptSource,
  type CheckpointTimelineDecisionSource,
  type CheckpointTimelineLegacySource,
  type CheckpointTimelineWithdrawalSource
} from "@/ui/waferwatch-wireframe/components/wafer-die-detail/checkpointTimelineModel";
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
  parent_wafer_id: string | null;
  die_label: string | null;
  wafer_family: string;
  die_count: number | null;
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
  | "id"
  | "wafer_id"
  | "template_id"
  | "status"
  | "assigned_at"
  | "started_at"
  | "completed_at"
  | "current_step_id"
>;

type WaferStatusExecutionRow = Pick<
  StepExecution,
  | "id"
  | "assignment_id"
  | "process_step_id"
  | "status"
  | "created_at"
  | "started_at"
  | "completed_at"
  | "completed_by"
  | "operator_id"
  | "run_notes"
  | "metadata"
>;

type WaferStatusStepRow = Pick<
  ProcessStep,
  "id" | "template_id" | "name" | "process_area" | "step_order" | "node_type" | "execution_mode" | "parameters_schema"
>;
type WaferStatusTransitionRow = Pick<ProcessStepTransition, "from_step_id" | "to_step_id" | "edge_type" | "priority" | "created_at">;
type WaferStatusProcessEventRow = {
  id: string;
  wafer_id: string | null;
  actor_id: string | null;
  event_type: string;
  event_at: string;
  notes: string | null;
  metadata: Json;
};

type UnknownRow = Record<string, unknown>;
type OptionalTableError = {
  code?: string;
  message?: string;
};
type OptionalTableResult = {
  data: unknown[] | null;
  error: OptionalTableError | null;
};
type OptionalTableClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: readonly string[]) => PromiseLike<OptionalTableResult>;
    };
  };
};

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

function asUnknownRow(value: unknown): UnknownRow | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRow)
    : null;
}

function getUnknownString(record: UnknownRow, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getUnknownNumber(record: UnknownRow, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStepParameterRecordMapKey(assignmentId: string, stepId: string) {
  return `${assignmentId}:${stepId}`;
}

function readStepParameterRecordValues(row: UnknownRow) {
  const schema = (row.schema_snapshot ?? {}) as Json;
  const schemaRoot = asUnknownRow(schema) ?? {};
  const recordNotes = asUnknownRow(schemaRoot.recordNotes) ?? {};
  const globalValues = asUnknownRow(row.global_values) ?? {};
  const templateValues = readStepParameterDefinitions(schema).map((definition) => ({
    id: definition.id,
    key: definition.key,
    label: definition.label,
    type: definition.type,
    value: (globalValues[definition.key] ?? null) as string | number | boolean | null,
    unit: definition.unit,
    notes: typeof recordNotes[definition.key] === "string" ? recordNotes[definition.key] : "",
    scope: "global" as const
  }));
  const localRows = Array.isArray(row.local_parameters) ? row.local_parameters : [];
  const localValues = localRows.flatMap((value) => {
    const parameter = asUnknownRow(value);
    const key = parameter ? getUnknownString(parameter, "key") : null;
    const label = parameter ? getUnknownString(parameter, "label") : null;
    if (!parameter || !key || !label) return [];
    const rawValue = parameter.value;
    const rawType = getUnknownString(parameter, "type");
    return [{
      id: getUnknownString(parameter, "id") ?? key,
      key,
      label,
      type: rawType === "number" || rawType === "boolean" || rawType === "select" ? rawType : "text",
      value: typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean"
        ? rawValue
        : null,
      unit: getUnknownString(parameter, "unit") ?? "",
      notes: getUnknownString(parameter, "notes") ?? "",
      scope: "local" as const
    }];
  });

  return [...templateValues, ...localValues];
}

function isMissingRelationError(error: OptionalTableError) {
  if (error.code === "42P01") return true;

  const message = error.message?.toLowerCase() ?? "";
  return error.code === "PGRST205" && message.includes("could not find the table");
}

async function listOptionalCheckpointRows({
  client,
  table,
  assignmentIds
}: {
  client: unknown;
  table: string;
  assignmentIds: readonly string[];
}) {
  if (assignmentIds.length === 0) return [];

  const result = await (client as OptionalTableClient)
    .from(table)
    .select("*")
    .in("assignment_id", assignmentIds);

  if (result.error) {
    if (isMissingRelationError(result.error)) return [];
    throw result.error;
  }

  return (result.data ?? [])
    .map(asUnknownRow)
    .filter((row): row is UnknownRow => Boolean(row));
}

function appendGrouped<T>(groups: Map<string, T[]>, key: string, value: T) {
  const group = groups.get(key);
  if (group) {
    group.push(value);
  } else {
    groups.set(key, [value]);
  }
}

function getTimelineActor({
  actorId,
  snapshotName,
  profileNameById
}: {
  actorId: string | null;
  snapshotName: string | null;
  profileNameById: ReadonlyMap<string, string>;
}) {
  return {
    id: actorId,
    name: snapshotName ?? (actorId ? profileNameById.get(actorId) ?? null : null)
  };
}

function getNoteAuthorValue(record: JsonRecord) {
  const metadataAuthor = getString(record, "note_author_name");
  const metadataAuthorId = getString(record, "note_author_id");

  return {
    noteAuthorId: metadataAuthorId,
    noteAuthorName: metadataAuthor
  };
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

function extractDieLabels(metadata: Json, waferCode: string) {
  const root = toJsonRecord(metadata);
  const labels = Array.isArray(root.die_labels)
    ? root.die_labels
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  if (labels.length > 0) {
    return Array.from(new Set(labels));
  }

  const dieCount = typeof root.die_count === "number" && Number.isInteger(root.die_count)
    ? Math.min(256, Math.max(0, root.die_count))
    : 0;

  return Array.from({ length: dieCount }, (_, index) => `${waferCode}_${index + 1}`);
}

function deriveWaferMode(metadata: Json, dieLabel: string | null): WaferDisplayMode {
  return readMetadataMode(metadata) ?? (dieLabel ? "diced" : "undiced");
}

function deriveStepStatusRank(status: StepStatus) {
  if (status === "awaiting_checkpoint") return 0;
  if (status === "redo_required") return 1;
  if (status === "running") return 2;
  if (status === "blocked") return 3;
  if (status === "failed") return 4;
  if (status === "queued") return 5;
  if (status === "pending") return 6;
  return 9;
}

function pickCurrentStepExecution(
  executions: ReadonlyArray<WaferStatusExecutionRow>,
  stepOccurrenceById: Map<string, number>
) {
  const prioritized = executions
    .filter((execution) => [
      "awaiting_checkpoint",
      "redo_required",
      "running",
      "blocked",
      "failed",
      "queued",
      "pending"
    ].includes(execution.status))
    .sort((a, b) => {
      const statusRank = deriveStepStatusRank(a.status) - deriveStepStatusRank(b.status);
      if (statusRank !== 0) {
        return statusRank;
      }

      const orderA = stepOccurrenceById.get(a.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = stepOccurrenceById.get(b.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return new Date(b.started_at ?? b.created_at).getTime() - new Date(a.started_at ?? a.created_at).getTime();
    });

  if (prioritized[0]) {
    return prioritized[0];
  }

  return executions
    .filter((execution) => execution.status === "completed" || execution.status === "skipped")
    .sort((a, b) => {
      const orderA = stepOccurrenceById.get(a.process_step_id) ?? Number.MIN_SAFE_INTEGER;
      const orderB = stepOccurrenceById.get(b.process_step_id) ?? Number.MIN_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderB - orderA;
      }

      return compareExecutionRecency(b, a);
    })[0];
}

function compareExecutionRecency(a: WaferStatusExecutionRow, b: WaferStatusExecutionRow) {
  const timeA = new Date(a.completed_at ?? a.started_at ?? a.created_at).getTime();
  const timeB = new Date(b.completed_at ?? b.started_at ?? b.created_at).getTime();
  return timeA - timeB;
}

function pickStepTimelineExecution(executions: ReadonlyArray<WaferStatusExecutionRow>) {
  return [...executions].sort((a, b) => {
    const rankDelta = deriveStepStatusRank(a.status) - deriveStepStatusRank(b.status);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return compareExecutionRecency(b, a);
  })[0] ?? null;
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
  stepOccurrenceById,
  textSurfacesByKey,
  revertHistoryByWaferId,
  checkpointHistoryByAssignmentId,
  stepParameterRecordsByAssignmentStep
}: {
  wafers: WaferStatusWaferRow[];
  assignmentsByWaferId: Map<string, WaferStatusAssignmentRow>;
  executionsByAssignmentId: Map<string, WaferStatusExecutionRow[]>;
  stepsById: Map<string, WaferStatusStepRow>;
  processSteps: WaferStatusStepRow[];
  stepOccurrenceById: Map<string, number>;
  textSurfacesByKey: Map<string, WaferStatusTextSurfaceRow>;
  revertHistoryByWaferId: Map<string, WaferStatusRevertEvent[]>;
  checkpointHistoryByAssignmentId: Map<string, WaferStatusCheckpointHistoryEntry[]>;
  stepParameterRecordsByAssignmentStep: Map<string, WaferStatusStepParameterRecord[]>;
}): WaferStatusModel {
  const familyBuckets = new Map<string, { wafers: WaferStatusWaferRow[]; tiles: WaferStatusTileModel[] }>();
  const tiles: WaferStatusTileModel[] = [];

  for (const wafer of wafers) {
    const assignment = assignmentsByWaferId.get(wafer.id) ?? null;
    const assignmentExecutions = assignment ? executionsByAssignmentId.get(assignment.id) ?? [] : [];
    if (assignment?.status === "planned" && assignmentExecutions.length === 0) {
      continue;
    }

    const currentExecution = assignment
      ? assignmentExecutions.find((execution) => execution.process_step_id === assignment.current_step_id) ??
        pickCurrentStepExecution(assignmentExecutions, stepOccurrenceById)
      : null;
    const currentStep = currentExecution ? stepsById.get(currentExecution.process_step_id) ?? null : null;
    const executionsByStepId = new Map<string, WaferStatusExecutionRow>();
    for (const step of processSteps) {
      const execution = pickStepTimelineExecution(
        assignmentExecutions.filter((candidate) => candidate.process_step_id === step.id)
      );
      if (execution) {
        executionsByStepId.set(step.id, execution);
      }
    }
    const legacyDieLabel = extractDieLabel(wafer.metadata);
    const mode = deriveWaferMode(wafer.metadata, legacyDieLabel);
    const generatedDieLabels = mode === "diced" && !legacyDieLabel
      ? extractDieLabels(wafer.metadata, wafer.wafer_code)
      : [];
    const dieLabels = generatedDieLabels.length > 0
      ? generatedDieLabels
      : [legacyDieLabel ?? wafer.wafer_code];
    const family = deriveFamily(wafer.wafer_code, wafer.metadata);
    for (const displayDieLabel of dieLabels) {
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
    const currentStepOccurrence = currentStep ? stepOccurrenceById.get(currentStep.id) ?? null : null;
    const tile: WaferStatusTileModel = {
      id: generatedDieLabels.length > 0 ? `${wafer.id}:${displayDieLabel}` : wafer.id,
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
      processSteps: processSteps.map((step, index) => {
        const execution = executionsByStepId.get(step.id) ?? null;
        const executionMetadata = toJsonRecord(execution?.metadata as Json);
        const noteAuthor = getNoteAuthorValue(executionMetadata);
        const noteAuthorId = noteAuthor.noteAuthorId ?? execution?.completed_by ?? execution?.operator_id ?? null;
        const timelineStatus: StepStatus =
          currentStepOccurrence !== null &&
          index < currentStepOccurrence &&
          execution?.status !== "completed" &&
          execution?.status !== "skipped"
            ? "completed"
            : execution?.status ?? "pending";

        return {
          id: step.id,
          name: step.name,
          processArea: step.process_area,
          executionMode: step.execution_mode,
          stepOrder: index + 1,
          status: timelineStatus,
          executionId: execution?.id ?? null,
          runNote: execution?.run_notes ?? null,
          noteAuthorId,
          noteAuthorName: noteAuthor.noteAuthorName ?? null,
          startedAt: execution?.started_at ?? null,
          completedAt: execution?.completed_at ?? null,
          createdAt: execution?.created_at ?? null,
          parametersSchema: step.parameters_schema,
          parameterRecords: assignment
            ? stepParameterRecordsByAssignmentStep.get(getStepParameterRecordMapKey(assignment.id, step.id)) ?? []
            : [],
          branchLabel: null
        };
      }),
      revertHistory: revertHistoryByWaferId.get(wafer.id) ?? [],
      checkpointHistory: assignment
        ? checkpointHistoryByAssignmentId.get(assignment.id) ?? []
        : [],
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
        .select("id, wafer_id, template_id, status, assigned_at, started_at, completed_at, current_step_id")
        .eq("template_id", processTemplateId)
        .is("deleted_at", null)
        .is("archived_at", null)
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
    .select("id, project_id, wafer_code, parent_wafer_id, die_label, wafer_family, die_count, status, notes, metadata, created_at")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("wafer_code", { ascending: true });

  const wafersResult = scopedWaferIds ? await wafersQuery.in("id", scopedWaferIds) : await wafersQuery;

  if (wafersResult.error) {
    throw wafersResult.error;
  }

  const allWafers = (wafersResult.data ?? []) as WaferStatusWaferRow[];
  const wafers = allWafers.filter((wafer) => {
    const metadata = toJsonRecord(wafer.metadata);
    const childWaferIds = metadata.diced_child_wafer_ids;
    const childDieLabels = metadata.diced_child_die_labels;
    return !(
      (Array.isArray(childWaferIds) && childWaferIds.length > 0) ||
      (Array.isArray(childDieLabels) && childDieLabels.length > 0)
    );
  });
  if (wafers.length === 0) {
    return getEmptyWaferStatusModel();
  }

  const waferIds = wafers.map((wafer) => wafer.id);
  const wafersById = new Map(allWafers.map((wafer) => [wafer.id, wafer]));
  const parentWaferIds = Array.from(new Set(
    wafers
      .map((wafer) => wafer.parent_wafer_id)
      .filter((waferId): waferId is string => Boolean(waferId))
  ));
  const projectIds = Array.from(new Set(wafers.map((wafer) => wafer.project_id)));
  const textSurfacesPromise = projectIds.length
    ? supabase
        .from("text_surfaces")
        .select("project_id, scope_type, scope_key, field_key, value")
        .in("project_id", projectIds)
        .eq("scope_type", waferDieNotesSurface.scopeType)
        .eq("field_key", waferDieNotesSurface.fieldKey)
    : Promise.resolve({ data: [], error: null } as const);

  const assignmentsResult = processTemplateId
    ? null
      : await supabase
        .from("wafer_process_assignments")
        .select("id, wafer_id, template_id, status, assigned_at, started_at, completed_at, current_step_id")
        .in("wafer_id", waferIds)
        .is("deleted_at", null)
        .is("archived_at", null)
        .in("status", ACTIVE_ASSIGNMENT_STATUSES)
        .order("assigned_at", { ascending: false });

  if (assignmentsResult?.error) {
    throw assignmentsResult.error;
  }

  const parentAssignmentsResult = !processTemplateId && parentWaferIds.length
    ? await supabase
        .from("wafer_process_assignments")
        .select("id, wafer_id, template_id, status, assigned_at, started_at, completed_at, current_step_id")
        .in("wafer_id", parentWaferIds)
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("assigned_at", { ascending: false })
    : null;

  if (parentAssignmentsResult?.error) {
    throw parentAssignmentsResult.error;
  }

  const assignments = processTemplateId
    ? scopedAssignments
    : (assignmentsResult?.data ?? []) as WaferStatusAssignmentRow[];
  const parentAssignments = processTemplateId
    ? scopedAssignments.filter((assignment) => parentWaferIds.includes(assignment.wafer_id))
    : (parentAssignmentsResult?.data ?? []) as WaferStatusAssignmentRow[];

  const assignmentsByWaferId = new Map<string, WaferStatusAssignmentRow>();
  const visibleWaferIds = new Set(waferIds);
  for (const assignment of assignments) {
    if (!visibleWaferIds.has(assignment.wafer_id)) {
      continue;
    }
    if (!assignmentsByWaferId.has(assignment.wafer_id)) {
      assignmentsByWaferId.set(assignment.wafer_id, assignment);
    }
  }

  const parentAssignmentsByWaferId = new Map<string, WaferStatusAssignmentRow[]>();
  for (const assignment of parentAssignments) {
    appendGrouped(parentAssignmentsByWaferId, assignment.wafer_id, assignment);
  }

  const parentLineageByAssignmentId = new Map<
    string,
    { assignment: WaferStatusAssignmentRow; wafer: WaferStatusWaferRow }
  >();
  for (const wafer of wafers) {
    const parentWaferId = wafer.parent_wafer_id;
    const childAssignment = assignmentsByWaferId.get(wafer.id);
    const parentWafer = parentWaferId ? wafersById.get(parentWaferId) : null;
    if (!parentWaferId || !childAssignment || !parentWafer) continue;

    const parentAssignment = (parentAssignmentsByWaferId.get(parentWaferId) ?? [])
      .find((candidate) => candidate.template_id === childAssignment.template_id);
    if (!parentAssignment) continue;

    parentLineageByAssignmentId.set(childAssignment.id, {
      assignment: parentAssignment,
      wafer: parentWafer
    });
  }

  const assignmentIds = Array.from(new Set([
    ...Array.from(assignmentsByWaferId.values()).map((assignment) => assignment.id),
    ...Array.from(parentLineageByAssignmentId.values()).map(({ assignment }) => assignment.id)
  ]));
  const historyWaferIds = Array.from(new Set([
    ...waferIds,
    ...Array.from(parentLineageByAssignmentId.values()).map(({ wafer }) => wafer.id)
  ]));
  const [
    textSurfacesResult,
    executionsResult,
    checkpointAttemptRows,
    checkpointDecisionRows,
    checkpointWithdrawalRows,
    stepParameterRecordRows,
    processEventsResult,
    scopedStepsResult,
    scopedTransitionsResult
  ] = await Promise.all([
    textSurfacesPromise,
    assignmentIds.length
      ? supabase
        .from("step_executions")
        .select(
          "id, assignment_id, process_step_id, status, created_at, started_at, completed_at, completed_by, operator_id, run_notes, metadata"
        )
        .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null } as const),
    listOptionalCheckpointRows({
      client: supabase,
      table: "process_step_attempts",
      assignmentIds
    }),
    listOptionalCheckpointRows({
      client: supabase,
      table: "checkpoint_decisions",
      assignmentIds
    }),
    listOptionalCheckpointRows({
      client: supabase,
      table: "checkpoint_submission_withdrawals",
      assignmentIds
    }),
    listOptionalCheckpointRows({
      client: supabase,
      table: "step_parameter_records",
      assignmentIds
    }),
    historyWaferIds.length
      ? supabase
          .from("process_events")
          .select("id, wafer_id, actor_id, event_type, event_at, notes, metadata")
          .in("wafer_id", historyWaferIds)
          .in("event_type", ["wafer_step_moved", "wafer_step_reverted", "checkpoint_step_entered", "wafer_history_undone"])
          .order("event_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    processTemplateId
      ? supabase
          .from("process_steps")
          .select("id, template_id, name, process_area, step_order, node_type, execution_mode, parameters_schema")
          .eq("template_id", processTemplateId)
          .order("step_order", { ascending: true })
      : Promise.resolve(null),
    processTemplateId
      ? supabase
          .from("process_step_transitions")
          .select("from_step_id, to_step_id, edge_type, priority, created_at")
          .eq("template_id", processTemplateId)
          .order("priority", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve(null)
  ]);

  if (textSurfacesResult.error) {
    throw textSurfacesResult.error;
  }

  if (executionsResult.error) {
    throw executionsResult.error;
  }

  if (processEventsResult.error) {
    throw processEventsResult.error;
  }

  if (scopedStepsResult?.error) {
    throw scopedStepsResult.error;
  }

  if (scopedTransitionsResult?.error) {
    throw scopedTransitionsResult.error;
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

  const executions = (executionsResult.data ?? []) as WaferStatusExecutionRow[];
  const allProcessEvents = (processEventsResult.data ?? []) as WaferStatusProcessEventRow[];
  const historyUndoState = getHistoryUndoState(allProcessEvents.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    metadata: event.metadata
  })));
  const visibleWorkflowEvents = allProcessEvents.filter((event) =>
    event.event_type !== "wafer_history_undone" &&
    !historyUndoState.undoneProcessEventIds.has(event.id)
  );
  const checkpointRouteState = getCheckpointRouteCorrectionState(visibleWorkflowEvents.map((event) => ({
    id: event.id,
    eventAt: event.event_at,
    metadata: event.metadata
  })));
  const processEvents = visibleWorkflowEvents.filter((event) => checkpointRouteState.visibleEventIds.has(event.id));
  const activeStepParameterRecordRows = stepParameterRecordRows.filter((row) => {
    const processEventId = getUnknownString(row, "process_event_id");
    return !processEventId || (
      !checkpointRouteState.correctedEventIds.has(processEventId) &&
      !historyUndoState.undoneProcessEventIds.has(processEventId)
    );
  });
  const executionsByAssignmentId = new Map<string, WaferStatusExecutionRow[]>();
  for (const execution of executions) {
    const bucket = executionsByAssignmentId.get(execution.assignment_id);
    if (bucket) {
      bucket.push(execution);
    } else {
      executionsByAssignmentId.set(execution.assignment_id, [execution]);
    }
  }

  const assignmentIdByWaferId = new Map(
    Array.from(assignmentsByWaferId.values()).map((assignment) => [assignment.wafer_id, assignment.id])
  );
  const historyAssignmentIds = new Set(assignmentIds);
  const revertHistoryByWaferId = new Map<string, WaferStatusRevertEvent[]>();
  for (const event of processEvents) {
    if (!event.wafer_id || event.event_type !== "wafer_step_reverted") {
      continue;
    }

    const metadata = toJsonRecord(event.metadata);
    const eventAssignmentId = getString(metadata, "assignment_id");
    const fromStepId = getString(metadata, "from_step_id");
    const toStepId = getString(metadata, "to_step_id");
    if (!fromStepId || !toStepId || eventAssignmentId !== assignmentIdByWaferId.get(event.wafer_id)) {
      continue;
    }

    const history = revertHistoryByWaferId.get(event.wafer_id) ?? [];
    history.push({
      id: event.id,
      fromStepId,
      toStepId,
      occurredAt: event.event_at,
      reason: event.notes
    });
    revertHistoryByWaferId.set(event.wafer_id, history);
  }

  const executionStepIds = Array.from(new Set(executions.map((execution) => execution.process_step_id)));
  const stepsResult = scopedStepsResult ?? (executionStepIds.length
      ? await supabase
          .from("process_steps")
          .select("id, template_id, name, process_area, step_order, node_type, execution_mode, parameters_schema")
          .in("id", executionStepIds)
          .order("step_order", { ascending: true })
      : ({ data: [], error: null } as const));

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  const stepRows = (stepsResult.data ?? []) as WaferStatusStepRow[];
  const templateIds = Array.from(new Set(stepRows.map((step) => step.template_id)));
  const transitionsResult = scopedTransitionsResult ?? (templateIds.length
      ? await supabase
          .from("process_step_transitions")
          .select("from_step_id, to_step_id, edge_type, priority, created_at")
          .in("template_id", templateIds)
          .order("priority", { ascending: true })
          .order("created_at", { ascending: true })
      : ({ data: [], error: null } as const));

  if (transitionsResult.error) {
    throw transitionsResult.error;
  }

  const transitionRows = (transitionsResult.data ?? []) as WaferStatusTransitionRow[];
  const stepsById = new Map(stepRows.map((step) => [step.id, step]));
  const processSteps = orderProcessStepsByOccurrence(stepRows, transitionRows);
  const stepOccurrenceById = new Map(processSteps.map((step, index) => [step.id, index]));

  const actorIds = new Set<string>();
  for (const execution of executions) {
    if (execution.completed_by) actorIds.add(execution.completed_by);
    if (execution.operator_id) actorIds.add(execution.operator_id);
  }
  for (const event of processEvents) {
    if (event.actor_id) actorIds.add(event.actor_id);
  }
  for (const row of checkpointAttemptRows) {
    const actorId = getUnknownString(row, "submitted_by");
    if (actorId) actorIds.add(actorId);
  }
  for (const row of checkpointDecisionRows) {
    const actorId = getUnknownString(row, "decided_by");
    if (actorId) actorIds.add(actorId);
  }
  for (const row of checkpointWithdrawalRows) {
    const actorId = getUnknownString(row, "withdrawn_by");
    if (actorId) actorIds.add(actorId);
  }
  for (const row of activeStepParameterRecordRows) {
    const actorId = getUnknownString(row, "recorded_by");
    if (actorId) actorIds.add(actorId);
  }

  const profilesResult = actorIds.size
    ? await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(actorIds))
    : ({ data: [], error: null } as const);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  const profileNameById = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      profile.display_name?.trim() || profile.email
    ])
  );
  const stepParameterRecordsByAssignmentStep = new Map<string, WaferStatusStepParameterRecord[]>();
  for (const row of activeStepParameterRecordRows) {
    const id = getUnknownString(row, "id");
    const assignmentId = getUnknownString(row, "assignment_id");
    const stepId = getUnknownString(row, "process_step_id");
    const movementMutationId = getUnknownString(row, "movement_mutation_id");
    const recordedAt = getUnknownString(row, "updated_at") ?? getUnknownString(row, "created_at");
    if (!id || !assignmentId || !stepId || !movementMutationId || !recordedAt) continue;
    const recordedById = getUnknownString(row, "recorded_by");
    appendGrouped(stepParameterRecordsByAssignmentStep, getStepParameterRecordMapKey(assignmentId, stepId), {
      id,
      revision: Math.max(1, getUnknownNumber(row, "revision") ?? 1),
      movementMutationId,
      recordedAt,
      recordedById,
      recordedByName: recordedById ? profileNameById.get(recordedById) ?? null : null,
      notes: getUnknownString(row, "notes"),
      values: readStepParameterRecordValues(row)
    });
  }
  const executionsById = new Map(executions.map((execution) => [execution.id, execution]));
  const attemptsByAssignmentId = new Map<string, CheckpointTimelineAttemptSource[]>();
  const decisionsByAssignmentId = new Map<string, CheckpointTimelineDecisionSource[]>();
  const withdrawalsByAssignmentId = new Map<string, CheckpointTimelineWithdrawalSource[]>();
  const legacyByAssignmentId = new Map<string, CheckpointTimelineLegacySource[]>();
  const checkpointExecutionIds = new Set<string>();

  for (const row of checkpointAttemptRows) {
    const id = getUnknownString(row, "id");
    const assignmentId = getUnknownString(row, "assignment_id");
    const stepId = getUnknownString(row, "process_step_id");
    const stepExecutionId = getUnknownString(row, "step_execution_id");
    const submittedAt = getUnknownString(row, "submitted_at");
    if (!id || !assignmentId || !stepId || !submittedAt || historyUndoState.undoneAttemptIds.has(id)) continue;

    if (stepExecutionId) checkpointExecutionIds.add(stepExecutionId);
    const submittedBy = getUnknownString(row, "submitted_by");
    const execution = stepExecutionId ? executionsById.get(stepExecutionId) ?? null : null;
    appendGrouped(attemptsByAssignmentId, assignmentId, {
      id,
      stepId,
      stepName:
        getUnknownString(row, "process_step_name_snapshot") ??
        stepsById.get(stepId)?.name ??
        "Unknown step",
      attemptNumber: Math.max(1, getUnknownNumber(row, "attempt_number") ?? 1),
      status: "awaiting_checkpoint",
      createdAt: getUnknownString(row, "created_at") ?? submittedAt,
      startedAt:
        getUnknownString(row, "started_at_snapshot") ??
        execution?.started_at ??
        execution?.created_at ??
        null,
      submittedAt,
      submittedBy: getTimelineActor({
        actorId: submittedBy,
        snapshotName: getUnknownString(row, "submitted_by_name_snapshot"),
        profileNameById
      }),
      submissionNote: getUnknownString(row, "submission_notes")
    });
  }

  for (const row of checkpointDecisionRows) {
    const id = getUnknownString(row, "id");
    const assignmentId = getUnknownString(row, "assignment_id");
    const attemptId = getUnknownString(row, "attempt_id");
    const decision = getUnknownString(row, "decision");
    const occurredAt = getUnknownString(row, "decided_at") ?? getUnknownString(row, "created_at");
    if (
      !id ||
      !assignmentId ||
      !attemptId ||
      !occurredAt ||
      historyUndoState.undoneDecisionIds.has(id) ||
      !["approved", "approve", "redo"].includes(decision ?? "")
    ) {
      continue;
    }

    const actorId = getUnknownString(row, "decided_by");
    const correctedRoute = checkpointRouteState.correctionByDecisionId.get(id);
    const destinationStepId = correctedRoute?.targetStepId ?? getUnknownString(row, "target_step_id");
    const correctedOutcome = correctedRoute?.routeDecision;
    appendGrouped(decisionsByAssignmentId, assignmentId, {
      id,
      attemptId,
      outcome: correctedOutcome === "redo" || (!correctedOutcome && decision === "redo") ? "redo" : "approve",
      occurredAt,
      actor: getTimelineActor({
        actorId,
        snapshotName: getUnknownString(row, "decided_by_name_snapshot"),
        profileNameById
      }),
      note: getUnknownString(row, "decision_notes"),
      destinationStepId,
      destinationStepName:
        correctedRoute?.targetStepName ??
        getUnknownString(row, "target_step_name_snapshot") ??
        (destinationStepId ? stepsById.get(destinationStepId)?.name ?? null : null),
      supersedesDecisionId: getUnknownString(row, "supersedes_decision_id")
    });
  }

  for (const row of checkpointWithdrawalRows) {
    const id = getUnknownString(row, "id");
    const assignmentId = getUnknownString(row, "assignment_id");
    const attemptId = getUnknownString(row, "attempt_id");
    const occurredAt = getUnknownString(row, "withdrawn_at") ?? getUnknownString(row, "created_at");
    if (!id || !assignmentId || !attemptId || !occurredAt) continue;

    const actorId = getUnknownString(row, "withdrawn_by");
    appendGrouped(withdrawalsByAssignmentId, assignmentId, {
      id,
      attemptId,
      occurredAt,
      actor: getTimelineActor({
        actorId,
        snapshotName: getUnknownString(row, "withdrawn_by_name_snapshot"),
        profileNameById
      }),
      note: getUnknownString(row, "withdrawal_reason")
    });
  }

  for (const execution of executions) {
    if (checkpointExecutionIds.has(execution.id)) continue;
    if (
      execution.status === "pending" &&
      !execution.started_at &&
      !execution.completed_at &&
      !execution.run_notes
    ) {
      continue;
    }

    const actorId = execution.completed_by ?? execution.operator_id;
    appendGrouped(legacyByAssignmentId, execution.assignment_id, {
      id: `legacy-execution:${execution.id}`,
      sourceEventId: null,
      legacyType: "step_execution",
      occurredAt: execution.completed_at ?? execution.started_at ?? execution.created_at,
      actor: getTimelineActor({ actorId, snapshotName: null, profileNameById }),
      note: execution.run_notes,
      fromStepId: null,
      fromStepName: null,
      toStepId: execution.process_step_id,
      toStepName: stepsById.get(execution.process_step_id)?.name ?? null,
      recordedStatus: execution.status
    });
  }

  for (const event of processEvents) {
    if (!event.wafer_id) continue;

    const metadata = toJsonRecord(event.metadata);
    const assignmentId = getString(metadata, "assignment_id");
    if (!assignmentId || !historyAssignmentIds.has(assignmentId)) continue;

    const fromStepId = getString(metadata, "from_step_id");
    const toStepId = getString(metadata, "to_step_id") ?? getString(metadata, "target_step_id");
    appendGrouped(legacyByAssignmentId, assignmentId, {
      id: `legacy-event:${event.id}`,
      sourceEventId: event.id,
      legacyType: event.event_type === "checkpoint_step_entered"
        ? "checkpoint_step_entered"
        : event.event_type === "wafer_step_reverted"
          ? "wafer_step_reverted"
          : "wafer_step_moved",
      occurredAt: event.event_at,
      actor: getTimelineActor({ actorId: event.actor_id, snapshotName: null, profileNameById }),
      note: event.notes,
      fromStepId,
      fromStepName: fromStepId ? stepsById.get(fromStepId)?.name ?? null : null,
      toStepId,
      toStepName:
        getString(metadata, "target_step_name") ??
        getString(metadata, "to_step_name") ??
        (toStepId ? stepsById.get(toStepId)?.name ?? null : null),
      recordedStatus: getString(metadata, "movement_kind") ?? event.event_type
    });
  }

  const checkpointHistoryByAssignmentId = new Map<string, WaferStatusCheckpointHistoryEntry[]>();
  for (const assignmentId of assignmentIds) {
    checkpointHistoryByAssignmentId.set(assignmentId, buildCheckpointTimeline({
      attempts: attemptsByAssignmentId.get(assignmentId) ?? [],
      decisions: decisionsByAssignmentId.get(assignmentId) ?? [],
      withdrawals: withdrawalsByAssignmentId.get(assignmentId) ?? [],
      legacyEntries: legacyByAssignmentId.get(assignmentId) ?? []
    }));
  }

  for (const [childAssignmentId, lineage] of parentLineageByAssignmentId) {
    checkpointHistoryByAssignmentId.set(childAssignmentId, mergeCheckpointTimelineLineage({
      currentEntries: checkpointHistoryByAssignmentId.get(childAssignmentId) ?? [],
      parentEntries: checkpointHistoryByAssignmentId.get(lineage.assignment.id) ?? [],
      parentWaferId: lineage.wafer.id,
      parentWaferCode: lineage.wafer.wafer_code
    }));
  }

  return mapWafersToStatusModel({
    wafers,
    assignmentsByWaferId,
    executionsByAssignmentId,
    stepsById,
    processSteps,
    stepOccurrenceById,
    textSurfacesByKey,
    revertHistoryByWaferId,
    checkpointHistoryByAssignmentId,
    stepParameterRecordsByAssignmentStep
  });
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
