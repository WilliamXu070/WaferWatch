import "server-only";

import { readStepParameterDefinitions } from "@/features/process-flows/stepParameters";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  Attachment,
  FabricationStatus,
  Json,
  OperationRunHistoryView,
  ProcessCurrentStateView,
  StepStatus
} from "@/types/database";
import type {
  DiePolingRows,
  WaferDisplayMode,
  WaferFamilyModel,
  WaferFamilyStatus,
  WaferStatusCheckpointHistoryEntry,
  WaferStatusHistoryCorrection,
  WaferStatusMetric,
  WaferStatusModel,
  WaferStatusOperationRunVisit,
  WaferStatusRevertEvent,
  WaferStatusStepParameterRecord,
  WaferStatusStepParameterValue,
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
  waferDieAppearanceSurface,
  waferDieNotesSurface
} from "@/ui/waferwatch-wireframe/components/wafer-die-detail/waferDieDetailData";
import {
  buildAppearanceSnapshotsBySurfaceKey,
  getAppearanceAttachmentIds,
  getWaferStatusSurfaceMapKey,
  groupAuthorizedAppearanceAttachments,
  type WaferStatusAppearanceAttachmentSource,
  type WaferStatusAppearanceSurfaceSource,
  type WaferStatusAppearanceSnapshot
} from "@/features/wafers/waferStatusAppearance";

type JsonRecord = { [key: string]: Json | undefined };
type UnknownRecord = Record<string, unknown>;
type DiePolingParameters = Record<string, DiePolingRows>;

type StatusStep = {
  id: string;
  name: string;
  process_area: string;
  execution_mode: "main" | "anytime";
  step_order: number;
  stage_step_order: number;
  parameters_schema: Json;
};

type TextSurfaceRow = {
  project_id: string;
  scope_key: string;
  field_key: string;
  value: string;
  version: number;
};

type CanonicalHistory = {
  visits: WaferStatusOperationRunVisit[];
  checkpointHistory: WaferStatusCheckpointHistoryEntry[];
  corrections: WaferStatusHistoryCorrection[];
  reverts: WaferStatusRevertEvent[];
};

const DIE_POLING_PARAMETERS_KEY = "die_poling_parameters";
const MAX_STATUS_HISTORY_ROWS = 10_000;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asJsonRecord(value: Json): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((row): row is UnknownRecord => Boolean(row))
    : [];
}

function stringValue(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonValue(record: UnknownRecord, key: string): Json {
  return (record[key] ?? null) as Json;
}

function readDiePolingParameters(metadata: Json): DiePolingParameters {
  const value = asJsonRecord(metadata)[DIE_POLING_PARAMETERS_KEY];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DiePolingParameters
    : {};
}

function readMetadataString(metadata: Json, key: string) {
  const value = asJsonRecord(metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataBoolean(metadata: Json, key: string) {
  const value = asJsonRecord(metadata)[key];
  return typeof value === "boolean" ? value : null;
}

function readNestedMetadata(metadata: Json) {
  const root = asJsonRecord(metadata);
  const candidate = root.viewer ?? root.wafer_viewer ?? root.wafer_status;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as JsonRecord
    : null;
}

function readNestedString(record: JsonRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeWaferMode(value: string): WaferDisplayMode | null {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (["undiced", "predice", "pre"].includes(normalized)) return "undiced";
  if (["diced", "postdice", "post"].includes(normalized)) return "diced";
  return null;
}

function deriveWaferMode(row: ProcessCurrentStateView): WaferDisplayMode {
  if (row.item_type === "die" || row.die_label) return "diced";
  const nested = readNestedMetadata(row.wafer_metadata);
  const mode = readMetadataString(row.wafer_metadata, "wafer_display_mode")
    ?? readMetadataString(row.wafer_metadata, "wafer_mode")
    ?? readMetadataString(row.wafer_metadata, "dice_state")
    ?? readNestedString(nested, "mode")
    ?? readNestedString(nested, "wafer_mode");
  if (mode) {
    const normalized = normalizeWaferMode(mode);
    if (normalized) return normalized;
  }
  const diced = readMetadataBoolean(row.wafer_metadata, "is_diced")
    ?? readMetadataBoolean(row.wafer_metadata, "diced");
  return diced ? "diced" : "undiced";
}

function extractDieLabels(row: ProcessCurrentStateView) {
  if (row.die_label?.trim()) return [row.die_label.trim()];
  const metadata = asJsonRecord(row.wafer_metadata);
  const labels = Array.isArray(metadata.die_labels)
    ? metadata.die_labels.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  if (labels.length > 0) return Array.from(new Set(labels.map((value) => value.trim())));
  const count = typeof metadata.die_count === "number" && Number.isInteger(metadata.die_count)
    ? Math.min(256, Math.max(0, metadata.die_count))
    : 0;
  return count > 0
    ? Array.from({ length: count }, (_, index) => `${row.wafer_code}_${index + 1}`)
    : [row.wafer_code];
}

function isDicedParent(metadata: Json) {
  const root = asJsonRecord(metadata);
  return (Array.isArray(root.diced_child_wafer_ids) && root.diced_child_wafer_ids.length > 0)
    || (Array.isArray(root.diced_child_die_labels) && root.diced_child_die_labels.length > 0);
}

function deriveFamily(row: ProcessCurrentStateView) {
  const nested = readNestedMetadata(row.wafer_metadata);
  const metadataFamily = readMetadataString(row.wafer_metadata, "wafer_family")
    ?? readMetadataString(row.wafer_metadata, "family")
    ?? readNestedString(nested, "wafer_family")
    ?? readNestedString(nested, "family");
  if (metadataFamily) return metadataFamily.toUpperCase();
  if (row.wafer_family?.trim()) return row.wafer_family.trim().toUpperCase();
  return row.wafer_code.trim().toUpperCase().match(/^[A-Z]+/)?.[0] ?? "WAFERS";
}

function memberStatusToStepStatus(status: string): StepStatus {
  if (status === "awaiting_review") return "awaiting_checkpoint";
  if (status === "rejected") return "redo_required";
  if (status === "cancelled") return "failed";
  return ["pending", "queued", "running", "blocked", "awaiting_checkpoint", "redo_required", "completed", "skipped", "failed"]
    .includes(status)
    ? status as StepStatus
    : "pending";
}

function textSurfaceKey(projectId: string, scopeKey: string, fieldKey: string) {
  return getWaferStatusSurfaceMapKey({
    projectId,
    scopeType: waferDieNotesSurface.scopeType,
    scopeKey,
    fieldKey
  });
}

function parseStatusSteps(snapshot: Json): StatusStep[] {
  const root = asRecord(snapshot);
  const definition = asRecord(root?.processDefinition);
  const stages = asRecordArray(definition?.stages);
  const steps: StatusStep[] = [];
  for (const stage of stages) {
    for (const row of asRecordArray(stage.steps)) {
      const id = stringValue(row, "id");
      const name = stringValue(row, "name");
      if (!id || !name) continue;
      steps.push({
        id,
        name,
        process_area: stringValue(row, "process_area") ?? "Process step",
        execution_mode: stringValue(row, "execution_mode") === "anytime" ? "anytime" : "main",
        step_order: numberValue(row, "step_order") ?? steps.length + 1,
        stage_step_order: numberValue(row, "stage_step_order") ?? 1,
        parameters_schema: jsonValue(row, "parameters_schema")
      });
    }
  }
  return steps;
}

function parameterValues(record: UnknownRecord): WaferStatusStepParameterValue[] {
  const schema = jsonValue(record, "schema_snapshot");
  const values = asRecord(record.values) ?? {};
  const legacyGlobal = asRecord(values.global_values);
  const source = legacyGlobal ?? values;
  const schemaRoot = asRecord(schema) ?? {};
  const recordNotes = asRecord(schemaRoot.recordNotes) ?? {};
  const definitions = readStepParameterDefinitions(schema);
  const knownKeys = new Set(definitions.map((definition) => definition.key));
  const defined = definitions.map((definition) => ({
    id: definition.id,
    key: definition.key,
    label: definition.label,
    type: definition.type,
    value: (source[definition.key] ?? null) as string | number | boolean | null,
    unit: definition.unit,
    notes: typeof recordNotes[definition.key] === "string" ? recordNotes[definition.key] as string : "",
    scope: "global" as const
  }));
  const unknown = Object.entries(source).flatMap(([key, value]) => {
    if (knownKeys.has(key) || key === "legacy_record_id" || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")) return [];
    return [{
      id: key,
      key,
      label: key.replace(/[_-]+/g, " "),
      type: typeof value === "number" ? "number" as const : typeof value === "boolean" ? "boolean" as const : "text" as const,
      value,
      unit: "",
      notes: "",
      scope: "global" as const
    }];
  });
  const local = Array.isArray(values.local_parameters)
    ? values.local_parameters.flatMap((candidate) => {
      const row = asRecord(candidate);
      const key = row ? stringValue(row, "key") : null;
      if (!row || !key) return [];
      const raw = row.value;
      return [{
        id: stringValue(row, "id") ?? key,
        key,
        label: stringValue(row, "label") ?? key.replace(/[_-]+/g, " "),
        type: stringValue(row, "type") === "number" ? "number" as const
          : stringValue(row, "type") === "boolean" ? "boolean" as const
            : stringValue(row, "type") === "select" ? "select" as const : "text" as const,
        value: typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : null,
        unit: stringValue(row, "unit") ?? "",
        notes: stringValue(row, "notes") ?? "",
        scope: "local" as const
      }];
    })
    : [];
  return [...defined, ...unknown, ...local];
}

function parseParameterRecords(row: OperationRunHistoryView, visitId: string) {
  return asRecordArray(row.parameter_records).map((record, index): WaferStatusStepParameterRecord => {
    const id = stringValue(record, "id") ?? `${visitId}:parameter:${index + 1}`;
    return {
      id,
      processEventId: null,
      historyVisitId: visitId,
      revision: index + 1,
      movementMutationId: stringValue(record, "client_mutation_id") ?? id,
      recordedAt: stringValue(record, "recorded_at") ?? row.created_at,
      recordedById: stringValue(record, "recorded_by"),
      recordedByName: stringValue(record, "recorded_by_name"),
      notes: stringValue(record, "correction_reason"),
      values: parameterValues(record)
    };
  });
}

function currentNote(row: OperationRunHistoryView) {
  const records = asRecordArray(row.notes);
  const superseded = new Set(records.map((record) => stringValue(record, "supersedes_note_id")).filter(Boolean));
  const active = records.filter((record) => {
    const id = stringValue(record, "id");
    return !id || !superseded.has(id);
  });
  return stringValue(active.at(-1) ?? {}, "body")
    ?? (typeof row.member_note === "string" ? row.member_note : null)
    ?? (typeof row.run_reason === "string" ? row.run_reason : null);
}

function uniqueCorrectionEvents(rows: readonly OperationRunHistoryView[]) {
  const events = new Map<string, UnknownRecord>();
  for (const row of rows) {
    for (const event of asRecordArray(row.history_corrections)) {
      const id = stringValue(event, "id");
      if (id) events.set(id, event);
    }
  }
  return Array.from(events.values()).sort((a, b) =>
    (stringValue(a, "eventAt") ?? "").localeCompare(stringValue(b, "eventAt") ?? "")
  );
}

function buildCanonicalHistory(rows: readonly OperationRunHistoryView[]): CanonicalHistory {
  const correctionEvents = uniqueCorrectionEvents(rows);
  const undoneAttemptIds = new Set<string>();
  const undoneDecisionIds = new Set<string>();
  const undoneCorrectionIds = new Set<string>();
  for (const event of correctionEvents) {
    if (stringValue(event, "eventType") !== "wafer_history_undone") continue;
    const metadata = asRecord(event.metadata) ?? {};
    const attemptId = stringValue(metadata, "undone_attempt_id");
    const decisionId = stringValue(metadata, "undone_decision_id");
    const processEventId = stringValue(metadata, "undone_process_event_id");
    if (attemptId) undoneAttemptIds.add(attemptId);
    if (decisionId) undoneDecisionIds.add(decisionId);
    if (processEventId) undoneCorrectionIds.add(processEventId);
  }

  const attempts: CheckpointTimelineAttemptSource[] = [];
  const decisions: CheckpointTimelineDecisionSource[] = [];
  const withdrawals: CheckpointTimelineWithdrawalSource[] = [];
  const legacyEntries: CheckpointTimelineLegacySource[] = [];
  const memberByAttemptId = new Map<string, string>();
  const visits: WaferStatusOperationRunVisit[] = [];
  const runById = new Map(rows.map((row) => [row.operation_run_id, row]));
  const reverts: WaferStatusRevertEvent[] = [];

  for (const row of rows) {
    const visitId = `operation-member:${row.operation_run_member_id}`;
    const checkpointRows = asRecordArray(row.checkpoint_history);
    visits.push({
      id: visitId,
      operationRunId: row.operation_run_id,
      operationRunMemberId: row.operation_run_member_id,
      legacyStepExecutionId: typeof row.legacy_step_execution_id === "string" ? row.legacy_step_execution_id : null,
      stepId: row.process_step_id,
      stepName: typeof row.process_step_name === "string" ? row.process_step_name : "Unknown step",
      processArea: typeof row.process_area === "string" ? row.process_area : "Process step",
      runKind: ["normal", "redo", "rework", "restore", "ad_hoc"].includes(String(row.run_kind))
        ? row.run_kind as WaferStatusOperationRunVisit["runKind"]
        : "normal",
      status: memberStatusToStepStatus(row.member_status),
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
      completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
      createdAt: row.created_at,
      note: currentNote(row),
      actor: {
        id: typeof row.created_by === "string" ? row.created_by : null,
        name: typeof row.created_by_name === "string" ? row.created_by_name : null
      },
      parameterRecords: parseParameterRecords(row, visitId)
    });

    for (const checkpoint of checkpointRows) {
      const attemptId = stringValue(checkpoint, "attemptId");
      const submittedAt = stringValue(checkpoint, "submittedAt");
      if (!attemptId || !submittedAt || undoneAttemptIds.has(attemptId)) continue;
      memberByAttemptId.set(attemptId, row.operation_run_member_id);
      attempts.push({
        id: attemptId,
        stepId: row.process_step_id,
        stepName: stringValue(checkpoint, "stepName") ?? (typeof row.process_step_name === "string" ? row.process_step_name : "Unknown step"),
        attemptNumber: Math.max(1, numberValue(checkpoint, "attemptNumber") ?? 1),
        status: "awaiting_checkpoint",
        createdAt: submittedAt,
        startedAt: stringValue(checkpoint, "startedAt") ?? (typeof row.started_at === "string" ? row.started_at : null),
        submittedAt,
        submittedBy: {
          id: stringValue(checkpoint, "submittedById"),
          name: stringValue(checkpoint, "submittedByName")
        },
        submissionNote: stringValue(checkpoint, "submissionNote")
      });
      const decisionId = stringValue(checkpoint, "decisionId");
      const decidedAt = stringValue(checkpoint, "decidedAt");
      const decision = stringValue(checkpoint, "decision");
      if (decisionId && decidedAt && decision && !undoneDecisionIds.has(decisionId)) {
        decisions.push({
          id: decisionId,
          attemptId,
          outcome: decision === "redo" ? "redo" : "approve",
          occurredAt: decidedAt,
          actor: {
            id: stringValue(checkpoint, "decidedById"),
            name: stringValue(checkpoint, "decidedByName")
          },
          note: stringValue(checkpoint, "decisionNote"),
          destinationStepId: stringValue(checkpoint, "targetStepId"),
          destinationStepName: stringValue(checkpoint, "targetStepName"),
          supersedesDecisionId: stringValue(checkpoint, "supersedesDecisionId")
        });
      }
      const withdrawalId = stringValue(checkpoint, "withdrawalId");
      const withdrawnAt = stringValue(checkpoint, "withdrawnAt");
      if (withdrawalId && withdrawnAt) {
        withdrawals.push({
          id: withdrawalId,
          attemptId,
          occurredAt: withdrawnAt,
          actor: {
            id: stringValue(checkpoint, "withdrawnById"),
            name: stringValue(checkpoint, "withdrawnByName")
          },
          note: stringValue(checkpoint, "withdrawalReason")
        });
      }
    }

    if (checkpointRows.length === 0) {
      legacyEntries.push({
        id: visitId,
        sourceEventId: null,
        legacyType: row.run_kind === "restore" ? "wafer_step_reverted" : "step_execution",
        occurredAt: typeof row.completed_at === "string"
          ? row.completed_at
          : typeof row.started_at === "string" ? row.started_at : row.created_at,
        actor: {
          id: typeof row.created_by === "string" ? row.created_by : null,
          name: typeof row.created_by_name === "string" ? row.created_by_name : null
        },
        note: currentNote(row),
        fromStepId: null,
        fromStepName: null,
        toStepId: row.process_step_id,
        toStepName: typeof row.process_step_name === "string" ? row.process_step_name : null,
        recordedStatus: `${String(row.run_kind)}:${row.member_status}`
      });
    }

    const parentLinks = asRecordArray(row.parent_runs);
    const parentLink = parentLinks.find((link) => ["redo", "restore"].includes(stringValue(link, "kind") ?? ""))
      ?? (row.run_kind === "redo" || row.run_kind === "restore" ? parentLinks[0] : null);
    const parent = parentLink ? runById.get(stringValue(parentLink, "runId") ?? "") : null;
    if (parent && parent.process_step_id !== row.process_step_id || row.run_kind === "restore" || row.run_kind === "redo") {
      reverts.push({
        id: `run-link:${row.operation_run_id}`,
        fromStepId: parent?.process_step_id ?? row.process_step_id,
        toStepId: row.process_step_id,
        occurredAt: row.created_at,
        reason: currentNote(row)
      });
    }
  }

  const checkpointHistory = buildCheckpointTimeline({ attempts, decisions, withdrawals, legacyEntries })
    .map((entry): WaferStatusCheckpointHistoryEntry => entry.kind === "attempt"
      ? { ...entry, operationRunMemberId: memberByAttemptId.get(entry.id) ?? null }
      : entry);

  const corrections = correctionEvents.flatMap((event): WaferStatusHistoryCorrection[] => {
    const id = stringValue(event, "id");
    if (!id || stringValue(event, "eventType") !== "wafer_history_correction" || undoneCorrectionIds.has(id)) return [];
    const metadata = asRecord(event.metadata) ?? {};
    const kind = stringValue(metadata, "kind");
    if (kind !== "insert" && kind !== "remove") return [];
    const placement = stringValue(metadata, "placement");
    return [{
      id,
      kind,
      visitId: `correction:${id}`,
      targetVisitId: stringValue(metadata, "target_visit_id"),
      anchorVisitId: stringValue(metadata, "anchor_visit_id"),
      placement: placement === "before" || placement === "after" ? placement : null,
      stepId: stringValue(metadata, "target_step_id"),
      stepName: stringValue(metadata, "target_step_name_snapshot"),
      processArea: stringValue(metadata, "target_step_process_area_snapshot"),
      completedAt: stringValue(metadata, "completed_at") ?? (kind === "insert" ? stringValue(event, "eventAt") : null),
      occurredAt: stringValue(event, "eventAt") ?? new Date(0).toISOString(),
      reason: stringValue(event, "notes"),
      actor: { id: stringValue(event, "actorId"), name: stringValue(event, "actorName") }
    }];
  });

  return {
    visits: visits.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    checkpointHistory,
    corrections,
    reverts
  };
}

function mapTileStatus(row: ProcessCurrentStateView, currentStep: StatusStep | null): WaferTileStatus {
  const status = row.current_member_status ? memberStatusToStepStatus(row.current_member_status) : "pending";
  if (status === "queued" || status === "pending" || row.wafer_status === "planned" || row.wafer_status === "queued") return "queued";
  const stepText = `${currentStep?.name ?? ""} ${currentStep?.process_area ?? ""}`.toLowerCase();
  if (stepText.includes("dice")) return "dice";
  if (stepText.includes("bond")) return "bond";
  if (stepText.includes("etch")) return "etch";
  if (stepText.includes("litho") || stepText.includes("expose")) return "litho";
  if (stepText.includes("test") || stepText.includes("probe") || stepText.includes("characterization")) return "test";
  if (stepText.includes("inspect") || stepText.includes("metrology") || stepText.includes("scan")) return "inspection";
  return row.wafer_status === "completed" ? "test" : "queued";
}

function stepLabel(row: ProcessCurrentStateView) {
  if (row.current_step_name) return row.current_step_name;
  const labels: Record<FabricationStatus, string> = {
    planned: "Planned",
    queued: "Queued",
    in_progress: "In progress",
    on_hold: "On hold",
    completed: "Complete",
    scrapped: "Scrapped"
  };
  return labels[row.wafer_status];
}

function buildMetrics(rows: readonly ProcessCurrentStateView[]): WaferStatusMetric[] {
  const active = rows.filter((row) => ["planned", "queued", "in_progress", "on_hold"].includes(row.wafer_status)).length;
  const running = rows.filter((row) => row.wafer_status === "in_progress").length;
  const completed = rows.filter((row) => row.wafer_status === "completed").length;
  return [
    { id: "wafers", label: "Wafers", value: String(rows.length), tone: "neutral" },
    { id: "active", label: "Active", value: String(active), tone: "active" },
    { id: "progress", label: "In progress", value: String(running), tone: "running" },
    { id: "yield", label: "Yield", value: rows.length ? `${Math.round((completed / rows.length) * 100)}%` : "0%", tone: "yield" }
  ];
}

function familyStatus(rows: readonly ProcessCurrentStateView[], tiles: readonly WaferStatusTileModel[]): WaferFamilyStatus {
  if (rows.every((row) => row.wafer_status === "planned" || row.wafer_status === "queued")) return "setup";
  if (rows.every((row) => row.wafer_status === "on_hold")) return "paused";
  return tiles.every((tile) => tile.status === "queued") ? "setup" : "active";
}

function mergeParentHistory(
  child: CanonicalHistory,
  parent: CanonicalHistory | null,
  parentRow: ProcessCurrentStateView | null
): CanonicalHistory {
  if (!parent || !parentRow) return child;
  const inheritance = { waferId: parentRow.wafer_id, waferCode: parentRow.wafer_code };
  return {
    visits: [
      ...parent.visits.map((visit) => ({ ...visit, inheritedFromParent: inheritance })),
      ...child.visits
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    checkpointHistory: mergeCheckpointTimelineLineage({
      currentEntries: child.checkpointHistory,
      parentEntries: parent.checkpointHistory,
      parentWaferId: parentRow.wafer_id,
      parentWaferCode: parentRow.wafer_code
    }),
    corrections: child.corrections,
    reverts: child.reverts
  };
}

export function getEmptyWaferStatusModel(): WaferStatusModel {
  return { metrics: buildMetrics([]), families: [] };
}

export async function getWaferStatusModel(processTemplateId?: string): Promise<WaferStatusModel> {
  if (!processTemplateId) return getEmptyWaferStatusModel();
  const supabase = await createServerSupabaseClient();
  const [snapshotResult, currentResult, historyResult] = await Promise.all([
    supabase.rpc("get_process_workspace_snapshot", { target_template_id: processTemplateId }),
    supabase
      .from("vw_process_current_state")
      .select("*")
      .eq("template_id", processTemplateId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("vw_operation_run_history")
      .select("*")
      .eq("template_id", processTemplateId)
      .order("created_at", { ascending: true })
      .limit(MAX_STATUS_HISTORY_ROWS)
  ]);
  const firstError = [snapshotResult.error, currentResult.error, historyResult.error].find(Boolean);
  if (firstError) throw firstError;

  const allStateRows = (currentResult.data ?? []) as ProcessCurrentStateView[];
  const visibleRows = allStateRows.filter((row) => !row.archived_at && !isDicedParent(row.wafer_metadata));
  if (visibleRows.length === 0) return getEmptyWaferStatusModel();
  const processSteps = parseStatusSteps(snapshotResult.data as Json);
  const stepById = new Map(processSteps.map((step) => [step.id, step]));
  const stateByWaferId = new Map(allStateRows.map((row) => [row.wafer_id, row]));
  const historyRows = (historyResult.data ?? []) as OperationRunHistoryView[];
  const historyRowsByAssignment = new Map<string, OperationRunHistoryView[]>();
  for (const row of historyRows) {
    historyRowsByAssignment.set(row.assignment_id, [...(historyRowsByAssignment.get(row.assignment_id) ?? []), row]);
  }
  const historyByAssignment = new Map<string, CanonicalHistory>();
  for (const [assignmentId, rows] of historyRowsByAssignment) historyByAssignment.set(assignmentId, buildCanonicalHistory(rows));

  const projectIds = Array.from(new Set(visibleRows.map((row) => row.project_id)));
  const textResult = await supabase
    .from("text_surfaces")
    .select("project_id, scope_key, field_key, value, version")
    .in("project_id", projectIds)
    .eq("scope_type", waferDieNotesSurface.scopeType)
    .in("field_key", [waferDieNotesSurface.fieldKey, waferDieAppearanceSurface.fieldKey]);
  if (textResult.error) throw textResult.error;
  const surfaces = (textResult.data ?? []) as TextSurfaceRow[];
  const surfaceByKey = new Map(surfaces.map((surface) => [
    textSurfaceKey(surface.project_id, surface.scope_key, surface.field_key),
    surface
  ]));
  const appearanceSurfaces: WaferStatusAppearanceSurfaceSource[] = surfaces.flatMap((surface) =>
    surface.field_key === waferDieAppearanceSurface.fieldKey && surface.value.trim()
      ? [{ projectId: surface.project_id, scopeKey: surface.scope_key, attachmentId: surface.value.trim(), version: surface.version }]
      : []
  );
  const attachmentIds = getAppearanceAttachmentIds(appearanceSurfaces);
  const attachmentResult = attachmentIds.length
    ? await supabase.from("attachments").select("id, project_id, bucket_name, object_path").in("id", attachmentIds).in("project_id", projectIds)
    : { data: [], error: null };
  if (attachmentResult.error) throw attachmentResult.error;
  const attachments: WaferStatusAppearanceAttachmentSource[] = (
    (attachmentResult.data ?? []) as Pick<Attachment, "id" | "project_id" | "bucket_name" | "object_path">[]
  ).map((attachment) => ({
    id: attachment.id,
    projectId: attachment.project_id,
    bucketName: attachment.bucket_name,
    objectPath: attachment.object_path
  }));
  const byBucket = groupAuthorizedAppearanceAttachments({ surfaces: appearanceSurfaces, attachments });
  const signedUrlByAttachmentId = new Map<string, string>();
  if (byBucket.size > 0) {
    const admin = createSupabaseAdminClient();
    await Promise.all(Array.from(byBucket.entries()).map(async ([bucket, bucketAttachments]) => {
      const signed = await admin.storage.from(bucket).createSignedUrls(bucketAttachments.map((attachment) => attachment.objectPath), 3600);
      if (signed.error || !signed.data) return;
      const byPath = new Map(bucketAttachments.map((attachment) => [attachment.objectPath, attachment]));
      for (const item of signed.data) {
        const attachment = item.path ? byPath.get(item.path) : null;
        if (attachment && item.signedUrl) signedUrlByAttachmentId.set(attachment.id, item.signedUrl);
      }
    }));
  }
  const appearanceByKey: Map<string, WaferStatusAppearanceSnapshot> = buildAppearanceSnapshotsBySurfaceKey({
    surfaces: appearanceSurfaces,
    attachments,
    signedUrlByAttachmentId,
    scopeType: waferDieAppearanceSurface.scopeType,
    fieldKey: waferDieAppearanceSurface.fieldKey
  });

  const buckets = new Map<string, { rows: ProcessCurrentStateView[]; tiles: WaferStatusTileModel[] }>();
  for (const row of visibleRows) {
    const ownHistory = historyByAssignment.get(row.assignment_id) ?? buildCanonicalHistory([]);
    const parentRow = row.parent_wafer_id ? stateByWaferId.get(row.parent_wafer_id) ?? null : null;
    const parentHistory = parentRow ? historyByAssignment.get(parentRow.assignment_id) ?? null : null;
    const history = mergeParentHistory(ownHistory, parentHistory, parentRow);
    const latestVisitByStep = new Map<string, WaferStatusOperationRunVisit>();
    for (const visit of history.visits) latestVisitByStep.set(visit.stepId, visit);
    const currentStep = row.current_step_id ? stepById.get(row.current_step_id) ?? null : null;
    const mode = deriveWaferMode(row);
    const labels = mode === "diced" ? extractDieLabels(row) : [row.wafer_code];
    const family = deriveFamily(row);
    for (const dieLabel of labels) {
      const scopeKey = getWaferDieNotesScopeKey(row.wafer_id, dieLabel);
      const stepNotes = Object.fromEntries(processSteps.map((step) => [
        step.id,
        surfaceByKey.get(textSurfaceKey(
          row.project_id,
          getWaferDieStepNotesScopeKey(row.wafer_id, dieLabel, step.id),
          waferDieNotesSurface.fieldKey
        ))?.value ?? null
      ]));
      const tile: WaferStatusTileModel = {
        id: labels.length > 1 ? `${row.wafer_id}:${dieLabel}` : row.wafer_id,
        projectId: row.project_id,
        waferId: row.wafer_id,
        assignmentId: row.assignment_id,
        historyRevision: row.assignment_revision,
        code: mode === "undiced" ? row.wafer_code : dieLabel,
        family,
        dieLabel,
        stepLabel: stepLabel(row),
        status: mapTileStatus(row, currentStep),
        waferStateName: mode === "undiced" ? "pre-dice" : "post-dice",
        legacyNote: row.wafer_notes,
        notesSurfaceValue: surfaceByKey.get(textSurfaceKey(row.project_id, scopeKey, waferDieNotesSurface.fieldKey))?.value ?? null,
        notesSurfaceValuesByStepId: stepNotes,
        appearance: appearanceByKey.get(textSurfaceKey(row.project_id, scopeKey, waferDieAppearanceSurface.fieldKey)) ?? null,
        currentStepId: row.current_step_id,
        currentStepExecutionId: row.legacy_step_execution_id,
        processSteps: processSteps.map((step, index) => {
          const visit = latestVisitByStep.get(step.id) ?? null;
          const isCurrentWithoutVisit = step.id === row.current_step_id && !visit;
          return {
            id: step.id,
            name: step.name,
            processArea: step.process_area,
            executionMode: step.execution_mode,
            stepOrder: index + 1,
            status: visit?.status ?? (isCurrentWithoutVisit && row.current_member_status
              ? memberStatusToStepStatus(row.current_member_status)
              : "pending"),
            executionId: visit?.legacyStepExecutionId ?? (isCurrentWithoutVisit ? row.legacy_step_execution_id : null),
            runNote: visit?.note ?? null,
            noteAuthorId: visit?.actor.id ?? null,
            noteAuthorName: visit?.actor.name ?? null,
            startedAt: visit?.startedAt ?? null,
            completedAt: visit?.completedAt ?? null,
            createdAt: visit?.createdAt ?? null,
            parametersSchema: step.parameters_schema,
            parameterRecords: history.visits.filter((candidate) => candidate.stepId === step.id).flatMap((candidate) => candidate.parameterRecords),
            branchLabel: null
          };
        }),
        revertHistory: history.reverts,
        checkpointHistory: history.checkpointHistory,
        operationRunVisits: history.visits,
        historyCorrections: history.corrections,
        mode,
        isUndiced: mode === "undiced",
        diePolingParameters: readDiePolingParameters(row.wafer_metadata)
      };
      const bucket = buckets.get(family) ?? { rows: [], tiles: [] };
      if (!bucket.rows.some((candidate) => candidate.wafer_id === row.wafer_id)) bucket.rows.push(row);
      bucket.tiles.push(tile);
      buckets.set(family, bucket);
    }
  }

  const families: WaferFamilyModel[] = Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, bucket]) => ({
      id: family.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "wafers",
      name: family,
      status: familyStatus(bucket.rows, bucket.tiles),
      tiles: bucket.tiles
    }));
  const selected = families.flatMap((family) => family.tiles).find((tile) => tile.status !== "queued")
    ?? families[0]?.tiles[0]
    ?? null;
  return {
    metrics: buildMetrics(visibleRows),
    families: families.map((family) => ({
      ...family,
      tiles: family.tiles.map((tile) => ({ ...tile, isSelected: tile.id === selected?.id }))
    }))
  };
}

export async function getWaferTimeline(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const [history, measurements, issues] = await Promise.all([
    supabase
      .from("vw_operation_run_history")
      .select("*")
      .eq("wafer_id", waferId)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase.from("measurements").select("*").eq("wafer_id", waferId).order("measured_at", { ascending: true }).limit(500),
    supabase.from("process_issues").select("*").eq("wafer_id", waferId).order("opened_at", { ascending: true }).limit(500)
  ]);
  const firstError = [history.error, measurements.error, issues.error].find(Boolean);
  if (firstError) throw firstError;
  const rows = (history.data ?? []) as OperationRunHistoryView[];
  const events = new Map<string, UnknownRecord>();
  for (const row of rows) {
    for (const event of asRecordArray(row.history_corrections)) {
      const id = stringValue(event, "id");
      if (id) events.set(id, event);
    }
  }
  return {
    steps: rows,
    events: Array.from(events.values()),
    measurements: measurements.data ?? [],
    issues: issues.data ?? []
  };
}
