import type { WaferStatusRevertEvent } from "../../types";

export type ProcessTimelineRevertEdge = WaferStatusRevertEvent & {
  attemptNumber: number;
  chainDepth: number;
  chainIndex: number;
  continuedByEventId: string | null;
  fromIndex: number;
  toIndex: number;
};

export function buildProcessTimelineRevertEdges(
  processSteps: readonly { id: string }[],
  history: readonly WaferStatusRevertEvent[]
) {
  const indexByStepId = new Map(processSteps.map((step, index) => [step.id, index]));
  const edges: ProcessTimelineRevertEdge[] = [];
  let nextChainIndex = 0;

  for (const event of history) {
    const fromIndex = indexByStepId.get(event.fromStepId);
    const toIndex = indexByStepId.get(event.toStepId);
    if (fromIndex === undefined || toIndex === undefined) {
      continue;
    }

    const precedingEdge = [...edges]
      .reverse()
      .find((edge) => edge.toStepId === event.fromStepId && edge.continuedByEventId === null);
    const chainIndex = precedingEdge?.chainIndex ?? nextChainIndex++;
    const edge: ProcessTimelineRevertEdge = {
      ...event,
      attemptNumber: edges.length + 1,
      chainDepth: precedingEdge ? precedingEdge.chainDepth + 1 : 0,
      chainIndex,
      continuedByEventId: null,
      fromIndex,
      toIndex
    };

    if (precedingEdge) {
      precedingEdge.continuedByEventId = edge.id;
    }
    edges.push(edge);
  }

  return edges;
}
