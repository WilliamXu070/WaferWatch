type HistoryEvent = {
  id: string;
  eventType: string;
  metadata: unknown;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function readId(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Workflow corrections are append-only. An Undo event marks the state it
 * replaces so every reader can project the same effective history head.
 */
export function getHistoryUndoState(events: readonly HistoryEvent[]) {
  const undoneProcessEventIds = new Set<string>();
  const undoneAttemptIds = new Set<string>();
  const undoneDecisionIds = new Set<string>();

  for (const event of events) {
    if (event.eventType !== "wafer_history_undone") continue;

    const metadata = asRecord(event.metadata);
    const processEventId = readId(metadata, "undone_process_event_id");
    const attemptId = readId(metadata, "undone_attempt_id");
    const decisionId = readId(metadata, "undone_decision_id");

    if (processEventId) undoneProcessEventIds.add(processEventId);
    if (attemptId) undoneAttemptIds.add(attemptId);
    if (decisionId) undoneDecisionIds.add(decisionId);
  }

  return { undoneProcessEventIds, undoneAttemptIds, undoneDecisionIds };
}
