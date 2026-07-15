// Pure timeline normalization shared by the server query and focused tests.
import type {
  WaferStatusCheckpointDecision,
  WaferStatusCheckpointHistoryEntry,
  WaferStatusTimelineActor
} from "../../types";

export type CheckpointTimelineAttemptSource = {
  id: string;
  stepId: string;
  stepName: string;
  attemptNumber: number;
  status: string;
  createdAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  submittedBy: WaferStatusTimelineActor;
  submissionNote: string | null;
};

export type CheckpointTimelineDecisionSource = {
  id: string;
  attemptId: string;
  outcome: "approve" | "redo";
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
  destinationStepId: string | null;
  destinationStepName: string | null;
  supersedesDecisionId: string | null;
};

export type CheckpointTimelineWithdrawalSource = {
  id: string;
  attemptId: string;
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
};

export type CheckpointTimelineLegacySource = {
  id: string;
  sourceEventId: string | null;
  legacyType: "step_execution" | "wafer_step_moved" | "wafer_step_reverted" | "checkpoint_step_entered";
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
  fromStepId: string | null;
  fromStepName: string | null;
  toStepId: string | null;
  toStepName: string | null;
  recordedStatus: string | null;
};

function timestampValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function compareOccurredAt(first: { occurredAt: string }, second: { occurredAt: string }) {
  const difference = timestampValue(first.occurredAt) - timestampValue(second.occurredAt);
  return difference || first.occurredAt.localeCompare(second.occurredAt);
}

function getEffectiveDecisions(decisions: readonly CheckpointTimelineDecisionSource[]) {
  const supersededIds = new Set(
    decisions
      .map((decision) => decision.supersedesDecisionId)
      .filter((decisionId): decisionId is string => Boolean(decisionId))
  );
  const sorted = [...decisions].sort(compareOccurredAt);
  const effective = [...sorted].reverse().find((decision) => !supersededIds.has(decision.id)) ?? null;

  return sorted.map<WaferStatusCheckpointDecision>((decision) => ({
    ...decision,
    isEffective: decision.id === effective?.id
  }));
}

function getAttemptState({
  attemptStatus,
  effectiveDecision,
  hasSubmission,
  latestWithdrawalAt,
  submittedAt
}: {
  attemptStatus: string;
  effectiveDecision: WaferStatusCheckpointDecision | null;
  hasSubmission: boolean;
  latestWithdrawalAt: string | null;
  submittedAt: string | null;
}) {
  if (effectiveDecision?.outcome === "approve") return "approved" as const;
  if (effectiveDecision?.outcome === "redo") return "redo_required" as const;

  const submissionWasWithdrawn = Boolean(
    hasSubmission &&
    latestWithdrawalAt &&
    submittedAt &&
    timestampValue(latestWithdrawalAt) >= timestampValue(submittedAt)
  );
  if (submissionWasWithdrawn || attemptStatus === "withdrawn") return "withdrawn" as const;
  if (hasSubmission || ["submitted", "awaiting_checkpoint"].includes(attemptStatus)) {
    return "awaiting_checkpoint" as const;
  }
  return "in_progress" as const;
}

export function buildCheckpointTimeline({
  attempts,
  decisions,
  withdrawals,
  legacyEntries
}: {
  attempts: readonly CheckpointTimelineAttemptSource[];
  decisions: readonly CheckpointTimelineDecisionSource[];
  withdrawals: readonly CheckpointTimelineWithdrawalSource[];
  legacyEntries: readonly CheckpointTimelineLegacySource[];
}): WaferStatusCheckpointHistoryEntry[] {
  const decisionsByAttemptId = new Map<string, CheckpointTimelineDecisionSource[]>();
  for (const decision of decisions) {
    decisionsByAttemptId.set(decision.attemptId, [
      ...(decisionsByAttemptId.get(decision.attemptId) ?? []),
      decision
    ]);
  }

  const withdrawalsByAttemptId = new Map<string, CheckpointTimelineWithdrawalSource[]>();
  for (const withdrawal of withdrawals) {
    withdrawalsByAttemptId.set(withdrawal.attemptId, [
      ...(withdrawalsByAttemptId.get(withdrawal.attemptId) ?? []),
      withdrawal
    ]);
  }

  const attemptEntries: WaferStatusCheckpointHistoryEntry[] = attempts.map((attempt) => {
    const attemptDecisions = getEffectiveDecisions(decisionsByAttemptId.get(attempt.id) ?? []);
    const effectiveDecision = attemptDecisions.find((decision) => decision.isEffective) ?? null;
    const attemptWithdrawals = [...(withdrawalsByAttemptId.get(attempt.id) ?? [])].sort(compareOccurredAt);
    const latestWithdrawalAt = attemptWithdrawals.at(-1)?.occurredAt ?? null;
    const submission = attempt.submittedAt
      ? {
          id: `submission:${attempt.id}:${attempt.submittedAt}`,
          occurredAt: attempt.submittedAt,
          actor: attempt.submittedBy,
          note: attempt.submissionNote
        }
      : null;

    return {
      kind: "attempt" as const,
      id: attempt.id,
      stepId: attempt.stepId,
      stepName: attempt.stepName,
      attemptNumber: Math.max(1, attempt.attemptNumber),
      state: getAttemptState({
        attemptStatus: attempt.status,
        effectiveDecision,
        hasSubmission: Boolean(submission),
        latestWithdrawalAt,
        submittedAt: attempt.submittedAt
      }),
      occurredAt: attempt.startedAt ?? attempt.createdAt,
      startedAt: attempt.startedAt,
      submission,
      withdrawals: attemptWithdrawals,
      decisions: attemptDecisions,
      effectiveDecision
    };
  });

  return [
    ...attemptEntries,
    ...legacyEntries.map((entry) => ({ kind: "legacy_transition" as const, ...entry }))
  ].sort((first, second) => {
    const difference = compareOccurredAt(first, second);
    return difference || first.id.localeCompare(second.id);
  });
}

export function mergeCheckpointTimelineLineage({
  currentEntries,
  parentEntries,
  parentWaferId,
  parentWaferCode
}: {
  currentEntries: readonly WaferStatusCheckpointHistoryEntry[];
  parentEntries: readonly WaferStatusCheckpointHistoryEntry[];
  parentWaferId: string;
  parentWaferCode: string;
}): WaferStatusCheckpointHistoryEntry[] {
  const inheritedEntries = parentEntries.map((entry) => ({
    ...entry,
    inheritedFromParent: {
      waferId: parentWaferId,
      waferCode: parentWaferCode
    }
  }));

  return [...inheritedEntries, ...currentEntries].sort((first, second) => {
    const difference = compareOccurredAt(first, second);
    if (difference) return difference;

    if (Boolean(first.inheritedFromParent) !== Boolean(second.inheritedFromParent)) {
      return first.inheritedFromParent ? -1 : 1;
    }

    return first.id.localeCompare(second.id);
  });
}

export type CheckpointTimelineDisplayEvent = {
  id: string;
  occurredAt: string;
  tone: "neutral" | "awaiting" | "approved" | "redo";
  title: string;
  stepName: string | null;
  actor: WaferStatusTimelineActor;
  note: string | null;
  inheritedFromParent?: { waferId: string; waferCode: string };
};

export function flattenCheckpointTimeline(
  entries: readonly WaferStatusCheckpointHistoryEntry[]
): CheckpointTimelineDisplayEvent[] {
  const events: CheckpointTimelineDisplayEvent[] = [];
  for (const entry of entries) {
    if (entry.kind === "legacy_transition") {
      const stepName = entry.toStepName ?? entry.fromStepName;
      events.push({
        id: entry.id,
        occurredAt: entry.occurredAt,
        tone: entry.legacyType === "wafer_step_reverted" ? "redo" : "neutral",
        title: entry.legacyType === "checkpoint_step_entered"
          ? "Moved here · Beginning"
          : entry.legacyType === "wafer_step_reverted"
            ? "Legacy redo movement"
            : entry.legacyType === "wafer_step_moved"
              ? "Legacy movement"
              : "Legacy step record",
        stepName,
        actor: entry.actor,
        note: entry.note,
        inheritedFromParent: entry.inheritedFromParent
      });
      continue;
    }

    events.push({
      id: `arrival:${entry.id}`,
      occurredAt: entry.occurredAt,
      tone: entry.state === "redo_required" ? "redo" : "neutral",
      title: entry.attemptNumber > 1 ? `Attempt ${entry.attemptNumber} began · Beginning` : "Arrived · Beginning",
      stepName: entry.stepName,
      actor: { id: null, name: null },
      note: null,
      inheritedFromParent: entry.inheritedFromParent
    });
    if (entry.submission) {
      events.push({
        id: entry.submission.id,
        occurredAt: entry.submission.occurredAt,
        tone: "awaiting",
        title: "Submitted · Complete · Awaiting checkpoint",
        stepName: entry.stepName,
        actor: entry.submission.actor,
        note: entry.submission.note,
        inheritedFromParent: entry.inheritedFromParent
      });
    }
    for (const withdrawal of entry.withdrawals) {
      events.push({
        id: withdrawal.id,
        occurredAt: withdrawal.occurredAt,
        tone: "neutral",
        title: "Submission withdrawn · Beginning",
        stepName: entry.stepName,
        actor: withdrawal.actor,
        note: withdrawal.note,
        inheritedFromParent: entry.inheritedFromParent
      });
    }
    for (const decision of entry.decisions) {
      events.push({
        id: decision.id,
        occurredAt: decision.occurredAt,
        tone: decision.outcome === "redo" ? "redo" : "approved",
        title: decision.outcome === "redo"
          ? `Redo requested · Beginning${decision.destinationStepName ? ` at ${decision.destinationStepName}` : ""}`
          : "Approved · Complete · Ready to move",
        stepName: entry.stepName,
        actor: decision.actor,
        note: decision.note,
        inheritedFromParent: entry.inheritedFromParent
      });
    }
  }
  return events.sort((first, second) => {
    const difference = timestampValue(first.occurredAt) - timestampValue(second.occurredAt);
    return difference || first.id.localeCompare(second.id);
  });
}
