import type {
  WaferStatusCheckpointAttemptEntry,
  WaferStatusStepParameterRecord,
  WaferStatusTileModel,
  WaferStatusTimelineActor
} from "../../types";

export type StepVisitHistoryItem = {
  id: string;
  stepId: string;
  stepName: string;
  processArea: string;
  executionId: string | null;
  state: "completed" | "current" | "returned";
  occurredAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  completionActor: WaferStatusTimelineActor;
  parameterRecords: readonly WaferStatusStepParameterRecord[];
  inheritedFromParent?: { waferId: string; waferCode: string };
  sequence: number;
  visitNumber: number;
};

const NO_ACTOR = { id: null, name: null } as const;

function timeValue(value: string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function compareVisits(first: StepVisitHistoryItem, second: StepVisitHistoryItem) {
  const difference = timeValue(first.occurredAt) - timeValue(second.occurredAt);
  return difference || first.id.localeCompare(second.id);
}

function assignParameterRecords(visits: StepVisitHistoryItem[]) {
  const visitsByStepId = new Map<string, StepVisitHistoryItem[]>();
  for (const visit of visits) {
    visitsByStepId.set(visit.stepId, [...(visitsByStepId.get(visit.stepId) ?? []), visit]);
  }

  for (const stepVisits of visitsByStepId.values()) {
    stepVisits.sort(compareVisits);
    const records = stepVisits[0]?.parameterRecords ?? [];
    for (const visit of stepVisits) visit.parameterRecords = [];

    for (const record of records) {
      const recordTime = timeValue(record.recordedAt);
      const matchingVisit = [...stepVisits]
        .reverse()
        .find((visit) => timeValue(visit.occurredAt) <= recordTime) ?? stepVisits[0];
      if (matchingVisit) {
        matchingVisit.parameterRecords = [...matchingVisit.parameterRecords, record];
      }
    }
  }
}

export function buildStepVisitHistory(tile: WaferStatusTileModel): StepVisitHistoryItem[] {
  const processSteps = tile.processSteps ?? [];
  const stepsById = new Map(processSteps.map((step) => [step.id, step]));
  const attempts = (tile.checkpointHistory ?? []).filter(
    (entry): entry is WaferStatusCheckpointAttemptEntry => entry.kind === "attempt"
  );
  const visits: StepVisitHistoryItem[] = attempts.map((attempt) => {
    const step = stepsById.get(attempt.stepId);
    return {
      id: `attempt:${attempt.id}`,
      stepId: attempt.stepId,
      stepName: attempt.stepName,
      processArea: step?.processArea ?? "Process step",
      executionId: step?.executionId ?? null,
      state: attempt.effectiveDecision?.outcome === "redo" ? "returned" : "completed",
      occurredAt: attempt.startedAt ?? attempt.occurredAt,
      startedAt: attempt.startedAt,
      completedAt: attempt.submission?.occurredAt ?? null,
      completionNote: attempt.submission?.note?.trim() || null,
      completionActor: attempt.submission?.actor ?? NO_ACTOR,
      parameterRecords: step?.parameterRecords ?? [],
      inheritedFromParent: attempt.inheritedFromParent,
      sequence: 0,
      visitNumber: 1
    };
  });

  const attemptedStepIds = new Set(attempts.map((attempt) => attempt.stepId));
  for (const step of processSteps) {
    const isCurrent = step.id === tile.currentStepId;
    const currentAttemptExists = isCurrent && attempts.some(
      (attempt) => attempt.stepId === step.id && ["in_progress", "awaiting_checkpoint", "withdrawn"].includes(attempt.state)
    );

    if (isCurrent && !currentAttemptExists && !["completed", "skipped"].includes(step.status)) {
      visits.push({
        id: `current:${step.executionId ?? step.id}`,
        stepId: step.id,
        stepName: step.name,
        processArea: step.processArea,
        executionId: step.executionId,
        state: "current",
        occurredAt: step.startedAt ?? step.createdAt,
        startedAt: step.startedAt,
        completedAt: null,
        completionNote: null,
        completionActor: NO_ACTOR,
        parameterRecords: step.parameterRecords ?? [],
        sequence: 0,
        visitNumber: 1
      });
      continue;
    }

    if (
      step.executionId &&
      !attemptedStepIds.has(step.id) &&
      ["completed", "skipped"].includes(step.status)
    ) {
      visits.push({
        id: `execution:${step.executionId}`,
        stepId: step.id,
        stepName: step.name,
        processArea: step.processArea,
        executionId: step.executionId,
        state: "completed",
        occurredAt: step.startedAt ?? step.createdAt,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        completionNote: step.runNote?.trim() || null,
        completionActor: { id: step.noteAuthorId, name: step.noteAuthorName },
        parameterRecords: step.parameterRecords ?? [],
        sequence: 0,
        visitNumber: 1
      });
    }
  }

  visits.sort(compareVisits);
  assignParameterRecords(visits);

  const visitCountByStepId = new Map<string, number>();
  return visits.map((visit, index) => {
    const visitNumber = (visitCountByStepId.get(visit.stepId) ?? 0) + 1;
    visitCountByStepId.set(visit.stepId, visitNumber);
    return { ...visit, sequence: index + 1, visitNumber };
  });
}
