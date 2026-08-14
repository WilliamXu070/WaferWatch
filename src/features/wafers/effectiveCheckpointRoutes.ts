type UnknownRecord = Record<string, unknown>;

export type EffectiveCheckpointRoute = {
  eventId: string;
  occurredAt: string;
  outcome: "approve" | "redo";
  destinationStepId: string | null;
  destinationStepName: string | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function readString(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolves append-only route corrections into the effective checkpoint
 * decision rendered by Status. Later corrections supersede earlier evidence
 * for the same decision without mutating the original audit rows.
 */
export function buildEffectiveCheckpointRouteMap(events: readonly unknown[]) {
  const evidence = events.flatMap((value) => {
    const event = asRecord(value);
    if (!event || readString(event, "eventType") !== "checkpoint_step_entered") return [];
    const metadata = asRecord(event.metadata);
    if (!metadata || !readString(metadata, "corrected_event_id")) return [];
    const movementKind = readString(metadata, "movement_kind");
    if (movementKind !== "checkpoint_route_auto_redo_correction" && movementKind !== "checkpoint_route_correction") {
      return [];
    }
    const eventId = readString(event, "id");
    const occurredAt = readString(event, "eventAt");
    const checkpointDecisionId = readString(metadata, "checkpoint_decision_id");
    const routeDecision = readString(metadata, "route_decision");
    if (!eventId || !occurredAt || !checkpointDecisionId || (routeDecision !== "approved" && routeDecision !== "redo")) {
      return [];
    }
    return [{
      checkpointDecisionId,
      route: {
        eventId,
        occurredAt,
        outcome: routeDecision === "redo" ? "redo" as const : "approve" as const,
        destinationStepId: routeDecision === "redo" ? readString(metadata, "target_step_id") : null,
        destinationStepName: routeDecision === "redo" ? readString(metadata, "target_step_name") : null
      }
    }];
  }).sort((first, second) =>
    first.route.occurredAt.localeCompare(second.route.occurredAt)
      || first.route.eventId.localeCompare(second.route.eventId)
  );

  const effectiveByDecisionId = new Map<string, EffectiveCheckpointRoute>();
  for (const item of evidence) effectiveByDecisionId.set(item.checkpointDecisionId, item.route);
  return effectiveByDecisionId;
}
