const PROCESS_STEP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedProcessStepId(stepId: string) {
  return PROCESS_STEP_ID_PATTERN.test(stepId);
}

export function getProcessFlowFallbackHref(processId?: string) {
  return processId
    ? `/process-flow?${new URLSearchParams({ processId }).toString()}`
    : "/process-flow";
}
