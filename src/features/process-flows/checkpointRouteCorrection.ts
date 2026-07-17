type CheckpointRouteEvent = {
  id: string;
  eventAt: string;
  metadata: unknown;
};

export type ActiveCheckpointRoute = {
  assignmentId: string;
  checkpointDecisionId: string;
  fromStepId: string;
  targetStepId: string;
  targetStepName: string | null;
  routeDecision: "approved" | "redo" | null;
};

type CheckpointRouteCorrectionState = {
  activeRouteByAssignmentId: Map<string, ActiveCheckpointRoute>;
  activeRouteByAssignmentStep: Map<string, ActiveCheckpointRoute>;
  correctedEventIds: Set<string>;
  correctionByDecisionId: Map<string, ActiveCheckpointRoute>;
  visibleEventIds: Set<string>;
};

export function getCheckpointRouteAssignmentStepKey(assignmentId: string, targetStepId: string) {
  return `${assignmentId}:${targetStepId}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRoute(event: CheckpointRouteEvent): ActiveCheckpointRoute | null {
  const metadata = asRecord(event.metadata);
  const assignmentId = readString(metadata, "assignment_id");
  const checkpointDecisionId = readString(metadata, "checkpoint_decision_id");
  const fromStepId = readString(metadata, "from_step_id");
  const targetStepId = readString(metadata, "target_step_id");
  if (!assignmentId || !checkpointDecisionId || !fromStepId || !targetStepId) {
    return null;
  }

  const routeDecision = readString(metadata, "route_decision");
  return {
    assignmentId,
    checkpointDecisionId,
    fromStepId,
    targetStepId,
    targetStepName: readString(metadata, "target_step_name"),
    routeDecision: routeDecision === "approved" || routeDecision === "redo"
      ? routeDecision
      : null
  };
}

export function getCheckpointRouteCorrectionState(
  events: readonly CheckpointRouteEvent[]
): CheckpointRouteCorrectionState {
  const correctedEventIds = new Set<string>();
  for (const event of events) {
    const correctedEventId = readString(asRecord(event.metadata), "corrected_event_id");
    if (correctedEventId) correctedEventIds.add(correctedEventId);
  }

  const visibleEvents = events
    .filter((event) => !correctedEventIds.has(event.id))
    .sort((first, second) => first.eventAt.localeCompare(second.eventAt) || first.id.localeCompare(second.id));
  const activeRouteByAssignmentId = new Map<string, ActiveCheckpointRoute>();
  const activeRouteByAssignmentStep = new Map<string, ActiveCheckpointRoute>();
  const correctionByDecisionId = new Map<string, ActiveCheckpointRoute>();

  for (const event of visibleEvents) {
    const route = readRoute(event);
    if (!route) continue;

    activeRouteByAssignmentId.set(route.assignmentId, route);
    activeRouteByAssignmentStep.set(
      getCheckpointRouteAssignmentStepKey(route.assignmentId, route.targetStepId),
      route
    );
    if (readString(asRecord(event.metadata), "corrected_event_id")) {
      correctionByDecisionId.set(route.checkpointDecisionId, route);
    }
  }

  return {
    activeRouteByAssignmentId,
    activeRouteByAssignmentStep,
    correctedEventIds,
    correctionByDecisionId,
    visibleEventIds: new Set(visibleEvents.map((event) => event.id))
  };
}
