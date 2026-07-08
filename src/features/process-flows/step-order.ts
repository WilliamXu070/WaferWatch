type ProcessStepOrderInput = {
  id: string;
  step_order: number;
  name?: string;
  node_type?: string | null;
};

type ProcessStepTransitionOrderInput = {
  from_step_id: string;
  to_step_id: string;
  edge_type: string;
  priority: number;
  created_at?: string | null;
};

function compareStepFallback<T extends ProcessStepOrderInput>(a: T, b: T) {
  const orderDelta = a.step_order - b.step_order;
  if (orderDelta !== 0) {
    return orderDelta;
  }

  return (a.name ?? "").localeCompare(b.name ?? "");
}

export function orderProcessStepsByOccurrence<T extends ProcessStepOrderInput>(
  steps: readonly T[],
  transitions: readonly ProcessStepTransitionOrderInput[]
) {
  if (steps.length < 2) {
    return [...steps];
  }

  const stepIds = new Set(steps.map((step) => step.id));
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const incomingCountById = new Map(steps.map((step) => [step.id, 0]));
  const outgoingById = new Map(steps.map((step) => [step.id, [] as ProcessStepTransitionOrderInput[]]));
  const flowTransitions = transitions.filter((transition) =>
    transition.edge_type !== "return" &&
    stepIds.has(transition.from_step_id) &&
    stepIds.has(transition.to_step_id)
  );

  for (const transition of flowTransitions) {
    outgoingById.get(transition.from_step_id)?.push(transition);
    incomingCountById.set(
      transition.to_step_id,
      (incomingCountById.get(transition.to_step_id) ?? 0) + 1
    );
  }

  for (const outgoing of outgoingById.values()) {
    outgoing.sort((a, b) => {
      const priorityDelta = a.priority - b.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const aStep = stepById.get(a.to_step_id);
      const bStep = stepById.get(b.to_step_id);
      if (aStep && bStep) {
        return compareStepFallback(aStep, bStep);
      }

      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
  }

  const sortedSteps = [...steps].sort(compareStepFallback);
  const explicitStarts = sortedSteps.filter((step) => step.node_type === "start");
  const roots = sortedSteps.filter((step) => (incomingCountById.get(step.id) ?? 0) === 0);
  const seeds = explicitStarts.length ? explicitStarts : roots.length ? roots : sortedSteps.slice(0, 1);
  const visited = new Set<string>();
  const orderedIds: string[] = [];

  const visit = (stepId: string) => {
    if (visited.has(stepId)) {
      return;
    }

    visited.add(stepId);
    orderedIds.push(stepId);

    for (const transition of outgoingById.get(stepId) ?? []) {
      visit(transition.to_step_id);
    }
  };

  seeds.forEach((step) => visit(step.id));

  for (const step of sortedSteps) {
    visit(step.id);
  }

  return orderedIds
    .map((stepId) => stepById.get(stepId))
    .filter((step): step is T => Boolean(step));
}
