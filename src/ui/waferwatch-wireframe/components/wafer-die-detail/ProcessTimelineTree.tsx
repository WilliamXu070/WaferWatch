import { CheckIcon } from "../../icons";
import type { WaferStatusProcessStepModel, WaferStatusTileModel } from "../../types";
import { buildProcessTimelineRevertEdges } from "./processTimelineReverts";

const ROW_HEIGHT = 104;
const MAIN_MARKER_X = 22;
const BRANCH_MARKER_X = 62;
const CONSECUTIVE_REVERT_OFFSET = 12;
const BRANCH_COLORS = ["#d78a17", "#3477b8", "#3f8c66", "#a0524a"] as const;
const TIMELINE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto"
});

const timelineAccentByFamily: Record<string, { line: string; fill: string; activeBackground: string }> = {
  ALPHA: { line: "#3f7534", fill: "#3f7534", activeBackground: "#f3f8f1" },
  BETA: { line: "#326b98", fill: "#326b98", activeBackground: "#f2f7fb" },
  GAMMA: { line: "#9f493f", fill: "#9f493f", activeBackground: "#fbf3f2" }
};

function getTimelineAccent(tile: WaferStatusTileModel) {
  return timelineAccentByFamily[tile.family.trim().toUpperCase()] ?? {
    line: "#171714",
    fill: "#171714",
    activeBackground: "#f5f5f2"
  };
}

function getStepState(step: WaferStatusProcessStepModel, currentStepId: string | null | undefined) {
  if (step.status === "completed" || step.status === "skipped") return "complete";
  if (step.id === currentStepId || ["running", "queued", "blocked", "failed"].includes(step.status)) return "active";
  return "pending";
}

function formatTimelineTime(step: WaferStatusProcessStepModel, state: "complete" | "active" | "pending") {
  const timestamp = step.completedAt ?? step.startedAt ?? step.createdAt;
  if (!timestamp) return state === "complete" ? "Complete" : state === "pending" ? "Pending" : "In progress";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return state === "pending" ? "Pending" : "Saved";
  return TIMELINE_TIME_FORMATTER.format(date);
}

function formatRevertTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved revert";
  return TIMELINE_TIME_FORMATTER.format(date);
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
  const revertEdges = buildProcessTimelineRevertEdges(processSteps, tile.revertHistory ?? []).map((event) => ({
    ...event,
    color: BRANCH_COLORS[(event.chainIndex + event.chainDepth) % BRANCH_COLORS.length]
  }));
  const revertEdgeById = new Map(revertEdges.map((event) => [event.id, event]));
  const getBranchX = (event: (typeof revertEdges)[number]) => (
    BRANCH_MARKER_X +
    (event.chainIndex % 2) * 12 +
    Math.min(event.chainDepth, 1) * CONSECUTIVE_REVERT_OFFSET
  );
  const revertsFromStep = new Map<string, typeof revertEdges>();
  for (const event of revertEdges) {
    revertsFromStep.set(event.fromStepId, [...(revertsFromStep.get(event.fromStepId) ?? []), event]);
  }

  const currentStepIndex = Math.max(0, processSteps.findIndex((step) => step.id === tile.currentStepId));
  const treeHeight = Math.max(processSteps.length * ROW_HEIGHT, ROW_HEIGHT);
  const markerY = (index: number) => index * ROW_HEIGHT + ROW_HEIGHT / 2;

  return (
    <ol className="relative min-w-0" aria-label="Process revision timeline">
      <svg
        className="pointer-events-none absolute left-0 top-0 z-[1] h-full w-[88px] overflow-visible"
        viewBox={`0 0 88 ${treeHeight}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {processSteps.length > 1 ? (
          <>
            <path
              d={`M ${MAIN_MARKER_X} ${markerY(0)} V ${markerY(processSteps.length - 1)}`}
              fill="none"
              stroke="#d9d9d3"
              strokeWidth="2"
            />
            <path
              d={`M ${MAIN_MARKER_X} ${markerY(0)} V ${markerY(currentStepIndex)}`}
              fill="none"
              stroke={accent.line}
              strokeWidth="2.5"
            />
          </>
        ) : null}

        {revertEdges.map((event) => {
          const branchX = getBranchX(event);
          const continuedByEvent = event.continuedByEventId
            ? revertEdgeById.get(event.continuedByEventId)
            : null;
          const continuationX = continuedByEvent ? getBranchX(continuedByEvent) : branchX;
          const sourceY = markerY(event.fromIndex);
          const targetY = markerY(event.toIndex);
          const bendY = targetY + Math.sign(sourceY - targetY || 1) * 24;
          const path = event.continuedByEventId
            ? `M ${continuationX} ${targetY} C ${continuationX} ${targetY + 20}, ${branchX} ${sourceY - 20}, ${branchX} ${sourceY}`
            : `M ${MAIN_MARKER_X} ${targetY} C ${branchX} ${targetY}, ${branchX} ${bendY}, ${branchX} ${sourceY}`;
          return (
            <g key={event.id}>
              <path
                d={path}
                fill="none"
                stroke={event.color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx={branchX} cy={sourceY} r="10" fill="#fffefb" stroke={event.color} strokeWidth="2.5" />
              <text
                x={branchX}
                y={sourceY + 3.5}
                fill={event.color}
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
              >
                {event.fromIndex + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {processSteps.map((step, index) => {
        const state = getStepState(step, tile.currentStepId);
        const attempts = revertsFromStep.get(step.id) ?? [];
        const isSelected = selectedStepId === step.id;
        const isActive = step.id === tile.currentStepId;
        const rowStyle = isActive || isSelected ? { backgroundColor: accent.activeBackground } : undefined;
        const canonicalDescription = step.processArea
          ? `${step.processArea} · ${formatTimelineTime(step, state)}`
          : formatTimelineTime(step, state);

        const content = (
          <>
            <span
              className="relative z-10 grid h-8 w-8 place-items-center rounded-full border text-[13px] font-semibold"
              style={{
                marginLeft: `${MAIN_MARKER_X - 16}px`,
                backgroundColor: state === "pending" ? "#fffefb" : accent.fill,
                borderColor: state === "pending" ? "#d4d4ce" : accent.fill,
                color: state === "pending" ? "#8a8a83" : "#fffefb"
              }}
            >
              {index + 1}
            </span>

            <span className="min-w-0 py-3">
              <strong className="block text-[15px] font-semibold leading-5 text-[#171714]">{step.name}</strong>
              <span className="mt-1 block text-[12px] font-medium leading-5 text-[#7b7b73]">{canonicalDescription}</span>
            </span>

            <span className="grid min-w-0 gap-2 py-2">
              {attempts.map((attempt) => (
                <span key={attempt.id} className="min-w-0 rounded-md border border-[#e2e2dc] bg-[#fffefb] px-2.5 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: attempt.color }} aria-hidden />
                    <strong className="truncate text-[11px] font-semibold text-[#34342f]">
                      Attempt {attempt.attemptNumber}
                    </strong>
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-[#6f6f68]">
                    {attempt.reason?.trim() || "Reverted attempt"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#96968f]">{formatRevertTime(attempt.occurredAt)}</span>
                </span>
              ))}
            </span>

            {state === "complete" ? (
              <span className="grid h-4 w-4 place-items-center rounded-full text-[#fffefb]" style={{ backgroundColor: accent.fill }} aria-hidden>
                <CheckIcon />
              </span>
            ) : null}
          </>
        );

        const rowClassName = "relative grid min-h-[104px] grid-cols-[88px_minmax(112px,1fr)_minmax(108px,0.9fr)_18px] items-center gap-2 rounded-lg px-1";
        return onSelectStep ? (
          <li key={step.id} className={rowClassName} style={rowStyle}>
            <button type="button" onClick={() => onSelectStep(step.id)} className="contents text-left" aria-pressed={isSelected}>
              {content}
            </button>
          </li>
        ) : (
          <li key={step.id} className={rowClassName} style={rowStyle}>
            {content}
          </li>
        );
      })}
    </ol>
  );
}
