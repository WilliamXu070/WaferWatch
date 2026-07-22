export const SCHEDULER_VERSION = "resource-topology-v1";
const SLOT_MS = 15 * 60 * 1000;
const TRAVEL_MS = 60 * 60 * 1000;

export type SchedulerOperation = {
  id: string;
  logicalId: string;
  startsAt: string;
  endsAt: string;
  rowVersion: number;
  userPinned: boolean;
  status: string;
};

export type SchedulerDependency = {
  predecessorId: string;
  successorId: string;
  lagMinutes: number;
};

export type SchedulerResource = {
  operationId: string;
  kind: "person" | "tool" | "recipe" | "location";
  resourceId: string;
};

export type SchedulerReservation = {
  toolId: string;
  startsAt: string;
  endsAt: string;
};

export type SchedulerInput = {
  operations: SchedulerOperation[];
  dependencies: SchedulerDependency[];
  resources: SchedulerResource[];
  unavailableToolIds: Set<string>;
  reservations: SchedulerReservation[];
  lockedOperationIds: Set<string>;
  rootOperationId: string | null;
  notBefore: string | null;
  delayMinutes: number;
  windowStartsAt: string;
  windowEndsAt: string;
};

export type SchedulerMove = {
  operationId: string;
  logicalId: string;
  expectedRowVersion: number;
  startsAt: string;
  endsAt: string;
  previousStartsAt: string;
  previousEndsAt: string;
};

export type SchedulerConflict = {
  operationId: string;
  kind: string;
  message: string;
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

function topologicalOrder(operations: SchedulerOperation[], dependencies: SchedulerDependency[]) {
  const ids = new Set(operations.map((operation) => operation.id));
  const indegree = new Map(Array.from(ids, (id) => [id, 0]));
  const successors = new Map<string, string[]>();
  for (const dependency of dependencies) {
    if (!ids.has(dependency.predecessorId) || !ids.has(dependency.successorId)) continue;
    indegree.set(dependency.successorId, (indegree.get(dependency.successorId) ?? 0) + 1);
    successors.set(dependency.predecessorId, [...(successors.get(dependency.predecessorId) ?? []), dependency.successorId]);
  }
  const ready = operations.filter((operation) => indegree.get(operation.id) === 0)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id));
  const ordered: string[] = [];
  while (ready.length) {
    const operation = ready.shift()!;
    ordered.push(operation.id);
    for (const successorId of successors.get(operation.id) ?? []) {
      indegree.set(successorId, (indegree.get(successorId) ?? 1) - 1);
      if (indegree.get(successorId) === 0) {
        const successor = operations.find((candidate) => candidate.id === successorId);
        if (successor) ready.push(successor);
        ready.sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id));
      }
    }
  }
  return ordered.length === operations.length ? ordered : null;
}

function affectedOperations(input: SchedulerInput) {
  if (!input.rootOperationId) return new Set(input.operations.map((operation) => operation.id));
  const successors = new Map<string, string[]>();
  for (const dependency of input.dependencies) {
    successors.set(dependency.predecessorId, [...(successors.get(dependency.predecessorId) ?? []), dependency.successorId]);
  }
  const affected = new Set<string>();
  const pending = [input.rootOperationId];
  while (pending.length) {
    const id = pending.shift()!;
    if (affected.has(id)) continue;
    affected.add(id);
    pending.push(...(successors.get(id) ?? []));
  }
  return affected;
}

export function buildPlanAdjustment(input: SchedulerInput) {
  const order = topologicalOrder(input.operations, input.dependencies);
  if (!order) {
    return { moves: [] as SchedulerMove[], conflicts: [{ operationId: "plan", kind: "dependency_cycle", message: "Plan dependencies contain a cycle." }] };
  }
  const byId = new Map(input.operations.map((operation) => [operation.id, operation]));
  const resourcesByOperation = new Map<string, SchedulerResource[]>();
  for (const resource of input.resources) {
    resourcesByOperation.set(resource.operationId, [...(resourcesByOperation.get(resource.operationId) ?? []), resource]);
  }
  const affected = affectedOperations(input);
  const scheduled = new Map(input.operations.map((operation) => [operation.id, {
    start: Date.parse(operation.startsAt),
    end: Date.parse(operation.endsAt)
  }]));
  const settled = new Set(input.operations.filter((operation) =>
    !affected.has(operation.id) || operation.userPinned || input.lockedOperationIds.has(operation.id) || operation.status === "cancelled"
  ).map((operation) => operation.id));
  const moves: SchedulerMove[] = [];
  const conflicts: SchedulerConflict[] = [];
  const windowStart = Date.parse(input.windowStartsAt);
  const windowEnd = Date.parse(input.windowEndsAt);
  const notBefore = input.notBefore ? Date.parse(input.notBefore) : windowStart;

  for (const operationId of order) {
    const operation = byId.get(operationId)!;
    if (!affected.has(operation.id) || operation.userPinned || input.lockedOperationIds.has(operation.id) || operation.status === "cancelled") continue;
    const duration = Date.parse(operation.endsAt) - Date.parse(operation.startsAt);
    let earliest = Math.max(Date.parse(operation.startsAt), notBefore, windowStart);
    if (operation.id === input.rootOperationId) earliest += input.delayMinutes * 60_000;
    for (const dependency of input.dependencies.filter((candidate) => candidate.successorId === operation.id)) {
      const predecessor = scheduled.get(dependency.predecessorId);
      if (predecessor) {
        const frozenRootDelay = dependency.predecessorId === input.rootOperationId
          && input.lockedOperationIds.has(dependency.predecessorId)
          ? input.delayMinutes * 60_000
          : 0;
        earliest = Math.max(earliest, predecessor.end + dependency.lagMinutes * 60_000 + frozenRootDelay);
      }
    }
    earliest = Math.ceil(earliest / SLOT_MS) * SLOT_MS;
    const operationResources = resourcesByOperation.get(operation.id) ?? [];
    const toolIds = operationResources.filter((resource) => resource.kind === "tool").map((resource) => resource.resourceId);
    const unavailableToolId = toolIds.find((toolId) => input.unavailableToolIds.has(toolId));
    if (unavailableToolId) {
      conflicts.push({ operationId: operation.id, kind: "tool_status", message: `Tool ${unavailableToolId} is unavailable.` });
      continue;
    }

    let slot: { start: number; end: number } | null = null;
    for (let candidateStart = earliest; candidateStart + duration <= windowEnd; candidateStart += SLOT_MS) {
      const candidateEnd = candidateStart + duration;
      const reservationConflict = input.reservations.some((reservation) =>
        toolIds.includes(reservation.toolId) && overlaps(candidateStart, candidateEnd, Date.parse(reservation.startsAt), Date.parse(reservation.endsAt))
      );
      if (reservationConflict) continue;
      const personIds = operationResources.filter((resource) => resource.kind === "person").map((resource) => resource.resourceId);
      const locationId = operationResources.find((resource) => resource.kind === "location")?.resourceId ?? null;
      let allocationConflict = false;
      for (const other of input.operations) {
        if (other.id === operation.id || !settled.has(other.id)) continue;
        const otherWindow = scheduled.get(other.id)!;
        const otherResources = resourcesByOperation.get(other.id) ?? [];
        const sharesTool = toolIds.some((toolId) => otherResources.some((resource) => resource.kind === "tool" && resource.resourceId === toolId));
        const sharedPeople = personIds.filter((personId) => otherResources.some((resource) => resource.kind === "person" && resource.resourceId === personId));
        if (sharesTool && overlaps(candidateStart, candidateEnd, otherWindow.start, otherWindow.end)) {
          allocationConflict = true;
          break;
        }
        if (sharedPeople.length) {
          const otherLocationId = otherResources.find((resource) => resource.kind === "location")?.resourceId ?? null;
          const buffer = locationId && otherLocationId && locationId !== otherLocationId ? TRAVEL_MS : 0;
          if (overlaps(candidateStart, candidateEnd, otherWindow.start - buffer, otherWindow.end + buffer)) {
            allocationConflict = true;
            break;
          }
        }
      }
      if (!allocationConflict) {
        slot = { start: candidateStart, end: candidateEnd };
        break;
      }
    }
    if (!slot) {
      conflicts.push({ operationId: operation.id, kind: "no_feasible_slot", message: "No feasible resource slot remains inside the plan window." });
      continue;
    }
    scheduled.set(operation.id, slot);
    settled.add(operation.id);
    if (slot.start !== Date.parse(operation.startsAt) || slot.end !== Date.parse(operation.endsAt)) {
      moves.push({
        operationId: operation.id,
        logicalId: operation.logicalId,
        expectedRowVersion: operation.rowVersion,
        startsAt: new Date(slot.start).toISOString(),
        endsAt: new Date(slot.end).toISOString(),
        previousStartsAt: operation.startsAt,
        previousEndsAt: operation.endsAt
      });
    }
  }
  return { moves, conflicts };
}
