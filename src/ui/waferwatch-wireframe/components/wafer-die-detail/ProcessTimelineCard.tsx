import type { WaferStatusTileModel } from "../../types";
import { CheckpointTimeline } from "./CheckpointTimeline";
import { DetailCard } from "./DetailCard";

function formatTimelineTimestamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatTimelineStatus(status: string | undefined) {
  if (status === "completed" || status === "skipped") return "Complete";
  if (status === "awaiting_checkpoint") return "Awaiting checkpoint";
  if (status === "redo_required") return "Redo required";
  if (status === "running" || status === "queued" || status === "in_progress") return "In progress";
  if (status === "blocked") return "Blocked";
  if (status === "failed") return "Failed";
  return "Pending";
}

export function ProcessTimelineCard({ tile }: { tile: WaferStatusTileModel }) {
  const processSteps = tile.processSteps?.length ? tile.processSteps : [];
  const currentStep = processSteps.find((step) => step.id === tile.currentStepId) ?? null;
  const currentStepRows = [
    ["Current step", currentStep?.name ?? tile.stepLabel],
    ["Status", formatTimelineStatus(currentStep?.status)],
    ["Started", formatTimelineTimestamp(currentStep?.startedAt ?? currentStep?.createdAt)],
    ["Completed", formatTimelineTimestamp(currentStep?.completedAt)]
  ] as const;

  return (
    <DetailCard title="Process timeline" className="lg:col-span-3">
      <div className="grid gap-6 lg:grid-cols-[minmax(390px,0.95fr)_minmax(0,1.05fr)]">
        <CheckpointTimeline entries={tile.checkpointHistory ?? []} />

        <div className="border-l border-[#eeeeea] pl-5">
          <h3 className="mb-4 text-[17px] font-semibold text-[#111111]">Current step information</h3>
          <dl className="grid max-w-[520px] gap-3 text-[14px]">
            {currentStepRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-b border-[#eeeeea] pb-3">
                <dt className="text-[#66665f]">{label}</dt>
                <dd className="font-semibold text-[#111111]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </DetailCard>
  );
}
