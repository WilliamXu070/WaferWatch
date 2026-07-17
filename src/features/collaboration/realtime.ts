export const WORKFLOW_BROADCAST_EVENT = "workflow_changed";
export const TEAM_MESSAGE_BROADCAST_EVENT = "team_message_inserted";
export const WORKFLOW_REALTIME_EVENT = "waferwatch:realtime-change";
export const WORKFLOW_LIBRARY_TOPIC = "workflow:library";
export const TEAM_MESSAGES_TOPIC = "team:messages";
export const DEFAULT_WORKFLOW_REFRESH_DEBOUNCE_MS = 350;
export const PROCESS_STEP_REFRESH_DEBOUNCE_MS = 1_000;

export type WorkflowBroadcastPayload = {
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  entityId: string | null;
  processTemplateId?: string | null;
  projectId?: string | null;
  waferId?: string | null;
  changedAt: string;
};

export type TeamMessageBroadcastPayload<T> = {
  record: T;
};

export function getWorkflowProcessTopic(processTemplateId: string) {
  return `workflow:process:${processTemplateId}`;
}

export function isWorkflowBroadcastPayload(value: unknown): value is WorkflowBroadcastPayload {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.table === "string" &&
    ["INSERT", "UPDATE", "DELETE"].includes(String(payload.operation)) &&
    typeof payload.changedAt === "string"
  );
}

export function getWorkflowRefreshDebounceMs(payload: WorkflowBroadcastPayload) {
  return payload.table === "process_steps"
    ? PROCESS_STEP_REFRESH_DEBOUNCE_MS
    : DEFAULT_WORKFLOW_REFRESH_DEBOUNCE_MS;
}

export function getBroadcastRecord<T>(value: unknown): T | null {
  if (!value || typeof value !== "object" || !("record" in value)) return null;
  const record = (value as TeamMessageBroadcastPayload<unknown>).record;
  return record && typeof record === "object" ? (record as T) : null;
}

export function isWorkflowEventFor({
  event,
  table,
  projectId,
  waferId
}: {
  event: Event;
  table: string;
  projectId?: string;
  waferId?: string;
}) {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isWorkflowBroadcastPayload(detail) || detail.table !== table) return false;
  if (projectId && detail.projectId !== projectId) return false;
  if (waferId && detail.waferId !== waferId) return false;
  return true;
}
