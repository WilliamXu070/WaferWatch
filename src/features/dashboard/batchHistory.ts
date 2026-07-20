import type { ProcessBatchHistoryView } from "@/types/database";
import type {
  BatchProcessHistoryItem,
  BatchProcessHistorySample,
  BatchProcessHistoryStatus
} from "@/ui/waferwatch-wireframe/types";

export const DASHBOARD_BATCH_HISTORY_LIMIT = 30;

const BATCH_STATUSES = new Set<BatchProcessHistoryStatus>([
  "awaiting_review",
  "approved",
  "redo",
  "withdrawn",
  "mixed"
]);

const SAMPLE_STATUSES = new Set<BatchProcessHistorySample["status"]>([
  "awaiting_review",
  "approved",
  "redo",
  "withdrawn"
]);

function toBatchStatus(value: string): BatchProcessHistoryStatus {
  return BATCH_STATUSES.has(value as BatchProcessHistoryStatus)
    ? (value as BatchProcessHistoryStatus)
    : "mixed";
}

function toSamples(value: ProcessBatchHistoryView["samples"]): BatchProcessHistorySample[] {
  if (!Array.isArray(value)) return [];

  const samples = new Map<string, BatchProcessHistorySample>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;

    const attemptId = typeof candidate.attemptId === "string" ? candidate.attemptId : null;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const status = typeof candidate.status === "string" ? candidate.status : "";
    if (!attemptId || !label || !SAMPLE_STATUSES.has(status as BatchProcessHistorySample["status"])) {
      continue;
    }

    samples.set(attemptId, {
      attemptId,
      label,
      status: status as BatchProcessHistorySample["status"]
    });
  }

  return Array.from(samples.values());
}

export function mapProcessBatchHistoryRows(
  rows: readonly ProcessBatchHistoryView[]
): BatchProcessHistoryItem[] {
  return rows
    .map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      processStepId: row.process_step_id,
      processName: row.process_name.trim() || "Unnamed process",
      submittedAt: row.submitted_at,
      operatorName: row.operator_name.trim() || "Unknown operator",
      note: row.note?.trim() || null,
      status: toBatchStatus(row.status),
      samples: toSamples(row.samples)
    }))
    .sort((a, b) => {
      const timeDifference = Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
      return timeDifference || b.id.localeCompare(a.id);
    })
    .slice(0, DASHBOARD_BATCH_HISTORY_LIMIT);
}
