import { CheckIcon } from "../../icons";
import type { WaferStatusProcessStepModel, WaferStatusRevertEvent, WaferStatusTileModel } from "../../types";

const ROW_HEIGHT = 76;
const MARKER_X = 18;

const timelineAccentByFamily: Record<string, { line: string; fill: string; text: string; activeBackground: string }> = {
  ALPHA: { line: "#3f7534", fill: "#3f7534", text: "#2d5327", activeBackground: "#f3f8f1" },
  BETA: { line: "#326b98", fill: "#326b98", text: "#2b5578", activeBackground: "#f2f7fb" },
  GAMMA: { line: "#9f493f", fill: "#9f493f", text: "#703831", activeBackground: "#fbf3f2" }
};

export function getTimelineAccent(tile: WaferStatusTileModel) {
  return timelineAccentByFamily[tile.family.trim().toUpperCase()] ?? {
    line: "#111111",
    fill: "#111111",
    text: "#111111",
    activeBackground: "#f5f5f2"
  };
}

function getStepState(step: WaferStatusProcessStepModel, currentStepId: string | null | undefined) {
  if (step.status === "completed" || step.status === "skipped") return "complete";
  if (step.id === currentStepId || ["running", "queued", "blocked", "failed"].includes(step.status)) return "active";
  return "pending";
}

export function formatTimelineTime(step: WaferStatusProcessStepModel, state: "complete" | "active" | "pending") {
  const timestamp = step.completedAt ?? step.startedAt ?? step.createdAt;
  if (!timestamp) return state === "complete" ? "Complete" : state === "pending" ? "Pending" : "In progress";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return state === "pending" ? "Pending" : "Saved";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function getRevertEdges(processSteps: readonly WaferStatusProcessStepModel[], history: readonly WaferStatusRevertEvent[]) {
  const indexByStepId = new Map(processSteps.map((step, index) => [step.id, index]));
  return history
    .map((event, index) => ({
      ...event,
      index,
      fromIndex: indexByStepId.get(event.fromStepId),
      toIndex: indexByStepId.get(event.toStepId)
    }))
    .filter((event): event is WaferStatusRevertEvent & { index: number; fromIndex: number; toIndex: number } =>
      event.fromIndex !== undefined && event.toIndex !== undefined
    );
}

export function ProcessTimelineTree({
  tile,
  selectedStepId,
  onSelectStep
}: {
  tile: WaferStatusTileModel;
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
}) {
  const accent = getTimelineAccent(tile);
  const processSteps = tile.processSteps?.length ? tile.processSteps : [];
  const revertEdges = getRevertEdges(processSteps, tile.revertHistory ?? []);
  const latestRevert = revertEdges.at(-1) ?? null;
  const revertsFromStep = new Map<string, typeof revertEdges>();
  const revertsToStep = new Map<string, typeof revertEdges>();
  for (const event of revertEdges) {
    revertsFromStep.set(event.fromStepId, [...(revertsFromStep.get(event.fromStepId) ?? []), event]);
    revertsToStep.set(event.toStepId, [...(revertsToStep.get(event.toStepId) ?? []), event]);
  }
  const treeHeight = Math.max(processSteps.length * ROW_HEIGHT, ROW_HEIGHT);

  return (
    <ol className="relative" aria-label="Process revision timeline">
      <svg
        className="pointer-events-none absolute left-0 top-0 h-full w-[72px] overflow-visible"
        viewBox={`0 0 72 ${treeHeight}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {processSteps.length > 1 ? (
          <path d={`M ${MARKER_X} ${ROW_HEIGHT / 2} V ${treeHeight - ROW_HEIGHT / 2}`} stroke="#deded8" strokeWidth="1.5" />
        ) : null}
        {revertEdges.map((event) => {
          const laneX = 42 + (event.index % 2) * 14;
          const fromY = event.fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
          const toY = event.toIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
          const isLatest = event.id === latestRevert?.id;
          return (
            <path
              key={event.id}
              d={`M ${MARKER_X} ${fromY} C ${laneX} ${fromY} ${laneX} ${toY} ${MARKER_X} ${toY}`}
              fill="none"
              stroke={isLatest ? accent.line : "#a8a8a1"}
              strokeWidth={isLatest ? "2.5" : "1.5"}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {processSteps.map((step, index) => {
        const state = getStepState(step, tile.currentStepId);
        const outgoing = revertsFromStep.get(step.id) ?? [];
        const incoming = revertsToStep.get(step.id) ?? [];
        const latestOutgoing = outgoing.at(-1) ?? null;
        const latestIncoming = incoming.at(-1) ?? null;
        const isCurrentRedoTarget = latestRevert?.toStepId === step.id;
        const isSelected = selectedStepId === step.id;
        const rowStyle = state === "active" || isCurrentRedoTarget || isSelected ? { backgroundColor: accent.activeBackground } : undefined;
        const description = latestOutgoing
          ? `Reverted to ${processSteps[latestOutgoing.toIndex]?.name ?? "earlier stage"}${latestOutgoing.reason ? `: ${latestOutgoing.reason}` : ""}`
          : latestIncoming
            ? `Redo branch ${latestIncoming.index + 1}${latestIncoming.reason ? `: ${latestIncoming.reason}` : ""}`
            : step.processArea ? `${step.processArea} · ${formatTimelineTime(step, state)}` : formatTimelineTime(step, state);
        const content = (
          <>
            <span className="relative z-10 grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold" style={{
              marginLeft: `${MARKER_X - 12}px`,
              backgroundColor: state === "pending" && !isCurrentRedoTarget ? "#ffffff" : accent.fill,
              borderColor: state === "pending" && !isCurrentRedoTarget ? "#d7d7d0" : accent.fill,
              color: state === "pending" && !isCurrentRedoTarget ? "#8a8a83" : "#ffffff"
            }}>
              {index + 1}
            </span>
            <span className="min-w-0 pr-2">
              <strong className="block truncate text-[14px] text-[#151512]">{step.name}</strong>
              <span className="block text-[12px] font-medium text-[#777770]">{description}</span>
            </span>
            {state === "complete" ? (
              <span className="grid h-4 w-4 place-items-center rounded-full text-white" style={{ backgroundColor: accent.fill }} aria-hidden>
                <CheckIcon />
              </span>
            ) : null}
          </>
        );

        return onSelectStep ? (
          <li key={step.id} className="relative grid min-h-[76px] grid-cols-[48px_minmax(0,1fr)_18px] items-center gap-2 rounded-lg" style={rowStyle}>
            <button type="button" onClick={() => onSelectStep(step.id)} className="contents text-left" aria-pressed={isSelected}>
              {content}
            </button>
          </li>
        ) : (
          <li key={step.id} className="relative grid min-h-[76px] grid-cols-[48px_minmax(0,1fr)_18px] items-center gap-2 rounded-lg" style={rowStyle}>
            {content}
          </li>
        );
      })}
    </ol>
  );
}
