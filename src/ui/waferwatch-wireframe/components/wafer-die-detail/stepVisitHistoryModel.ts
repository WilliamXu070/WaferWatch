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
  redoDestinationStepId: string | null;
  redoDestinationStepName: string | null;
  parameterRecords: readonly WaferStatusStepParameterRecord[];
  historyAction?: {
    kind: "redo" | "undo" | "continue";
    targetStepName: string;
  } | null;
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

function compareVisitBeginnings(first: StepVisitHistoryItem, second: StepVisitHistoryItem) {
  const difference = timeValue(first.startedAt ?? first.occurredAt) - timeValue(second.startedAt ?? second.occurredAt);
  return difference || first.id.localeCompare(second.id);
}

function compareVisitProgression(first: StepVisitHistoryItem, second: StepVisitHistoryItem) {
  const completionDifference = timeValue(first.completedAt) - timeValue(second.completedAt);
  if (completionDifference) return completionDifference;

  return compareVisitBeginnings(first, second);
}

function assignParameterRecords(visits: StepVisitHistoryItem[]) {
  const visitsByStepId = new Map<string, StepVisitHistoryItem[]>();
  for (const visit of visits) {
    visitsByStepId.set(visit.stepId, [...(visitsByStepId.get(visit.stepId) ?? []), visit]);
  }

  for (const stepVisits of visitsByStepId.values()) {
    stepVisits.sort(compareVisitBeginnings);
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
      redoDestinationStepId: attempt.effectiveDecision?.outcome === "redo"
        ? attempt.effectiveDecision.destinationStepId
        : null,
      redoDestinationStepName: attempt.effectiveDecision?.outcome === "redo"
        ? attempt.effectiveDecision.destinationStepName
        : null,
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
        redoDestinationStepId: null,
        redoDestinationStepName: null,
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
        redoDestinationStepId: null,
        redoDestinationStepName: null,
        parameterRecords: step.parameterRecords ?? [],
        sequence: 0,
        visitNumber: 1
      });
    }
  }

  visits.sort(compareVisitProgression);
  assignParameterRecords(visits);

  const historyActionByVisitId = new Map<string, NonNullable<StepVisitHistoryItem["historyAction"]>>();
  for (const revert of tile.revertHistory ?? []) {
    const sourceVisit = [...visits]
      .reverse()
      .find((visit) =>
        visit.stepId === revert.fromStepId &&
        timeValue(visit.completedAt ?? visit.occurredAt) <= timeValue(revert.occurredAt)
      );
    const destinationStepName = stepsById.get(revert.toStepId)?.name;
    if (sourceVisit && destinationStepName) {
      historyActionByVisitId.set(sourceVisit.id, { kind: "undo", targetStepName: destinationStepName });
    }
  }

  const visitCountByStepId = new Map<string, number>();
  return visits.map((visit, index) => {
    const visitNumber = (visitCountByStepId.get(visit.stepId) ?? 0) + 1;
    visitCountByStepId.set(visit.stepId, visitNumber);
    const precedingRedo = [...visits.slice(0, index)]
      .reverse()
      .find((candidate) =>
        candidate.state === "returned" &&
        candidate.redoDestinationStepName === visit.stepName
      );
    const historyAction = historyActionByVisitId.get(visit.id) ?? (
      visit.state === "returned" && visit.redoDestinationStepName
        ? { kind: "redo" as const, targetStepName: visit.redoDestinationStepName }
        : visit.state === "current" && precedingRedo
          ? { kind: "continue" as const, targetStepName: visit.stepName }
          : null
    );
    return { ...visit, historyAction, sequence: index + 1, visitNumber };
  });
}
