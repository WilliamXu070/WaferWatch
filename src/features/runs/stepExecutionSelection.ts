export const CURRENT_STEP_STATUSES = ["pending", "queued", "running", "blocked", "failed"] as const;

type CurrentStepStatus = (typeof CURRENT_STEP_STATUSES)[number];

export type StepExecutionSelectionRow = {
  process_step_id: string;
  status: string;
  started_at: string | null;
  created_at: string;
};

function isCurrentStepStatus(status: string): status is CurrentStepStatus {
  return CURRENT_STEP_STATUSES.includes(status as CurrentStepStatus);
}

export function getCurrentStepStatusRank(status: string) {
  if (status === "running") return 0;
  if (status === "blocked") return 1;
  if (status === "failed") return 2;
  if (status === "queued") return 3;
  if (status === "pending") return 4;
  return 9;
}

export function getSourceStepExecution<T extends StepExecutionSelectionRow>(
  executions: T[],
  sourceStepId: string
) {
  return executions
    .filter((execution) =>
      execution.process_step_id === sourceStepId &&
      isCurrentStepStatus(execution.status)
    )
    .sort((a, b) => {
      const statusRank = getCurrentStepStatusRank(a.status) - getCurrentStepStatusRank(b.status);
      if (statusRank !== 0) {
        return statusRank;
      }

      return new Date(b.started_at ?? b.created_at).getTime() - new Date(a.started_at ?? a.created_at).getTime();
    })[0] ?? null;
}
