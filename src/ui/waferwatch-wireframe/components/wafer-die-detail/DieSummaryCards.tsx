import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";

function formatStepTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatStepStatus(status: string | undefined, fallbackStatus: WaferStatusTileModel["status"]) {
  if (status === "completed") return "Complete";
  if (status === "running" || status === "in_progress") return "In progress";
  if (status === "blocked") return "Blocked";
  if (status === "failed") return "Failed";
  return fallbackStatus === "queued" ? "Pending" : "In progress";
}

export function CurrentStepCard({ tile }: { tile: WaferStatusTileModel }) {
  const processSteps = tile.processSteps ?? [];
  const currentStepIndex = processSteps.findIndex((step) =>
    step.id === tile.currentStepId || (!tile.currentStepId && step.name === tile.stepLabel)
  );
  const currentStep = currentStepIndex >= 0 ? processSteps[currentStepIndex] : null;
  const totalSteps = processSteps.length;
  const stepNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 0;
  const progressPercent = totalSteps ? Math.round((stepNumber / totalSteps) * 100) : 0;
  const details = [
    ["Started", formatStepTimestamp(currentStep?.startedAt ?? currentStep?.createdAt)],
    ["Completed", formatStepTimestamp(currentStep?.completedAt)],
    ["Operator", currentStep?.noteAuthorName ?? "Unassigned"]
  ];

  return (
    <DetailCard title="Current step">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-semibold leading-none text-[#111111]">{tile.stepLabel}</h2>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2 py-1 text-[12px] font-semibold text-[#44443f]">
          {formatStepStatus(currentStep?.status, tile.status)}
        </span>
      </div>
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[#6b6a5f]">
          <span>{totalSteps ? `Step ${stepNumber} of ${totalSteps}` : "No process steps"}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#eeeeea]">
          <div className="h-full rounded-full bg-[#111111]" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      <dl className="mt-8 grid gap-5 text-[14px]">
        {details.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-4">
            <dt className="font-medium text-[#777770]">{label}</dt>
            <dd className="font-semibold text-[#111111]">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailCard>
  );
}

export function KeyResultsCard() {
  return (
    <DetailCard title="Key results">
      <div className="grid gap-5">
        <div className="border-b border-[#eeeeea] pb-4">
          <p className="text-[12px] font-medium text-[#777770]">Uniformity</p>
          <p className="mt-1 text-[24px] font-semibold text-[#111111]">Pending</p>
        </div>
        <div>
          <p className="mb-3 text-[12px] font-medium text-[#777770]">Best image</p>
          <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-[#ddddda] bg-white text-[13px] font-semibold text-[#8a8a83]">
            No image yet
          </div>
        </div>
      </div>
    </DetailCard>
  );
}
