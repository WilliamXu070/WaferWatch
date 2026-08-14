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
  isRedoVisit?: boolean;
  isHistoricalCorrection?: boolean;
  correctionReason?: string | null;
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
  const progressionTime = (visit: StepVisitHistoryItem) => visit.completedAt
    ? timeValue(visit.completedAt)
    : visit.state === "current"
      ? Number.MAX_SAFE_INTEGER
      : timeValue(visit.startedAt ?? visit.occurredAt);
  const progressionDifference = progressionTime(first) - progressionTime(second);
  if (progressionDifference) return progressionDifference;

  return compareVisitBeginnings(first, second);
}

function isConfirmedRepeatedVisit(
  visits: readonly StepVisitHistoryItem[],
  index: number,
  attemptNumberByVisitId: ReadonlyMap<string, number>
) {
  const visit = visits[index];
  if (!visit) return false;
  if ((attemptNumberByVisitId.get(visit.id) ?? 0) > 1) return true;

  return visits.slice(0, index).some((candidate) =>
    candidate.stepId === visit.stepId
    && (Boolean(candidate.completedAt) || attemptNumberByVisitId.has(candidate.id))
  );
}

function removeInheritedHandoffDuplicates(
  visits: readonly NonNullable<WaferStatusTileModel["operationRunVisits"]>[number][],
  attempts: readonly WaferStatusCheckpointAttemptEntry[]
) {
  const attemptedMemberIds = new Set(
    attempts
      .map((attempt) => attempt.operationRunMemberId)
      .filter((memberId): memberId is string => Boolean(memberId))
  );
  const inheritedVisits = visits.filter((visit) => Boolean(visit.inheritedFromParent));

  return visits.filter((visit) => {
    if (
      visit.inheritedFromParent
      || visit.status !== "completed"
      || !visit.startedAt
      || !visit.completedAt
      || attemptedMemberIds.has(visit.operationRunMemberId)
      || timeValue(visit.startedAt) !== timeValue(visit.completedAt)
    ) {
      return true;
    }

    return !inheritedVisits.some((inherited) =>
      inherited.stepId === visit.stepId
      && Boolean(inherited.completedAt)
      && timeValue(inherited.completedAt) === timeValue(visit.completedAt)
    );
  });
}

function uniqueOperationRunVisits(
  visits: readonly NonNullable<WaferStatusTileModel["operationRunVisits"]>[number][]
) {
  const visitsByMemberId = new Map<string, NonNullable<WaferStatusTileModel["operationRunVisits"]>[number]>();
  for (const visit of visits) visitsByMemberId.set(visit.operationRunMemberId, visit);
  return Array.from(visitsByMemberId.values());
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
      const exactVisit = record.historyVisitId
        ? stepVisits.find((visit) => visit.id === record.historyVisitId) ?? null
        : null;
      if (exactVisit) {
        exactVisit.parameterRecords = [...exactVisit.parameterRecords, record];
        continue;
      }
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

function mergeHistoryCorrections(tile: WaferStatusTileModel, visits: StepVisitHistoryItem[]) {
  const corrections = tile.historyCorrections ?? [];
  const removedVisitIds = new Set(
    corrections
      .filter((correction) => correction.kind === "remove" && correction.targetVisitId)
      .map((correction) => correction.targetVisitId!)
  );
  const visibleVisits = visits.filter((visit) => !removedVisitIds.has(visit.id));
  const inserted = corrections
    .filter((correction) => correction.kind === "insert" && correction.stepId && !removedVisitIds.has(correction.visitId))
    .map((correction): StepVisitHistoryItem => {
      const step = tile.processSteps?.find((candidate) => candidate.id === correction.stepId) ?? null;
      return {
        id: correction.visitId,
        stepId: correction.stepId!,
        stepName: correction.stepName ?? step?.name ?? "Historical step",
        processArea: correction.processArea ?? step?.processArea ?? "Process step",
        executionId: null,
        state: "completed",
        occurredAt: correction.completedAt ?? correction.occurredAt,
        startedAt: correction.completedAt ?? correction.occurredAt,
        completedAt: correction.completedAt ?? correction.occurredAt,
        completionNote: correction.reason,
        completionActor: correction.actor,
        redoDestinationStepId: null,
        redoDestinationStepName: null,
        parameterRecords: (step?.parameterRecords ?? []).filter((record) => record.historyVisitId === correction.visitId),
        isHistoricalCorrection: true,
        correctionReason: correction.reason,
        sequence: 0,
        visitNumber: 1
      };
    })
    .sort(compareVisitProgression);

  // Anchors preserve why a correction was made, but the effective history is a
  // timeline: every viewing surface must derive its position from event time.
  return [...visibleVisits, ...inserted].sort(compareVisitProgression);
}

export function buildStepVisitHistory(tile: WaferStatusTileModel): StepVisitHistoryItem[] {
  const processSteps = tile.processSteps ?? [];
  const stepsById = new Map(processSteps.map((step) => [step.id, step]));
  const attempts = Array.from(new Map(
    (tile.checkpointHistory ?? [])
      .filter((entry): entry is WaferStatusCheckpointAttemptEntry => entry.kind === "attempt")
      .map((attempt) => [attempt.id, attempt])
  ).values());
  const canonicalVisits = removeInheritedHandoffDuplicates(
    uniqueOperationRunVisits(tile.operationRunVisits ?? []).filter((visit) =>
      !(visit.status === "completed" && !visit.startedAt && !visit.completedAt)
    ),
    attempts
  );
  const canonicalVisitIdByMemberId = new Map(
    canonicalVisits.map((visit) => [visit.operationRunMemberId, visit.id])
  );
  const attemptNumberByVisitId = new Map(
    attempts.map((attempt) => [
      attempt.operationRunMemberId
        ? canonicalVisitIdByMemberId.get(attempt.operationRunMemberId) ?? `attempt:${attempt.id}`
        : `attempt:${attempt.id}`,
      attempt.attemptNumber
    ])
  );
  const visits: StepVisitHistoryItem[] = canonicalVisits.length > 0
    ? canonicalVisits.map((visit) => {
      const attempt = attempts.find(
        (candidate) => candidate.operationRunMemberId === visit.operationRunMemberId
      ) ?? null;
      const matchesCurrentIdentity = tile.currentStepExecutionId
        ? visit.legacyStepExecutionId === tile.currentStepExecutionId
        : tile.currentStepId
          ? visit.stepId === tile.currentStepId
          : true;
      const isActive = matchesCurrentIdentity
        && ["pending", "queued", "running", "blocked", "failed", "awaiting_checkpoint", "redo_required"].includes(visit.status);
      return {
        id: visit.id,
        stepId: visit.stepId,
        stepName: visit.stepName,
        processArea: visit.processArea,
        executionId: visit.legacyStepExecutionId,
        state: isActive
          ? "current"
          : "completed",
        occurredAt: visit.startedAt ?? visit.createdAt,
        startedAt: visit.startedAt,
        completedAt: visit.completedAt,
        completionNote: attempt?.submission?.note?.trim() || visit.note?.trim() || null,
        completionActor: attempt?.submission?.actor ?? visit.actor,
        redoDestinationStepId: attempt?.effectiveDecision?.outcome === "redo"
          ? attempt.effectiveDecision.destinationStepId
          : null,
        redoDestinationStepName: attempt?.effectiveDecision?.outcome === "redo"
          ? attempt.effectiveDecision.destinationStepName
          : null,
        parameterRecords: [...visit.parameterRecords],
        isRedoVisit: visit.runKind === "redo",
        inheritedFromParent: visit.inheritedFromParent,
        sequence: 0,
        visitNumber: 1
      };
    })
    : attempts.map((attempt) => {
    const step = stepsById.get(attempt.stepId);
    return {
      id: `attempt:${attempt.id}`,
      stepId: attempt.stepId,
      stepName: attempt.stepName,
      processArea: step?.processArea ?? "Process step",
      executionId: step?.executionId ?? null,
      state: "completed",
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
  for (const step of canonicalVisits.length > 0 ? [] : processSteps) {
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

  const effectiveVisits = mergeHistoryCorrections(tile, visits);
  assignParameterRecords(effectiveVisits);

  const historyActionByVisitId = new Map<string, NonNullable<StepVisitHistoryItem["historyAction"]>>();
  for (const revert of tile.revertHistory ?? []) {
    if (revert.kind === "redo") continue;
    const sourceVisit = [...effectiveVisits]
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

  const redoDestinationVisitIds = new Set<string>();
  effectiveVisits.forEach((source, index) => {
    if (!source.redoDestinationStepId && !source.redoDestinationStepName) return;
    const destination = effectiveVisits.find((candidate, candidateIndex) => {
      if (candidateIndex <= index) return false;
      const matchesDestination = source.redoDestinationStepId
        ? candidate.stepId === source.redoDestinationStepId
        : candidate.stepName === source.redoDestinationStepName;
      return matchesDestination
        && isConfirmedRepeatedVisit(effectiveVisits, candidateIndex, attemptNumberByVisitId);
    });
    if (destination) redoDestinationVisitIds.add(destination.id);
  });

  const visitCountByStepId = new Map<string, number>();
  return effectiveVisits.map((visit, index) => {
    const visitNumber = (visitCountByStepId.get(visit.stepId) ?? 0) + 1;
    visitCountByStepId.set(visit.stepId, visitNumber);
    const isConfirmedRedoVisit = Boolean(visit.isRedoVisit)
      && isConfirmedRepeatedVisit(effectiveVisits, index, attemptNumberByVisitId);
    const historyAction = historyActionByVisitId.get(visit.id) ?? (
      isConfirmedRedoVisit || redoDestinationVisitIds.has(visit.id)
        ? { kind: "redo" as const, targetStepName: visit.stepName }
        : null
    );
    return { ...visit, isRedoVisit: isConfirmedRedoVisit, historyAction, sequence: index + 1, visitNumber };
  });
}
