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

function stepStatusPresentation(status: string | undefined, fallbackStatus: WaferStatusTileModel["status"]) {
  if (status === "queued" || status === "pending") return { label: "Not started", className: "border-[#deded8] bg-[#f4f4f1] text-[#64645e]" };
  if (status === "running" || status === "in_progress") return { label: "In progress", className: "border-[#bfd8f0] bg-[#edf6fd] text-[#245b87]" };
  if (status === "awaiting_checkpoint") return { label: "Waiting for verification", className: "border-[#f0d29c] bg-[#fff7e8] text-[#8a5d12]" };
  if (status === "ready_to_move") return { label: "Verified — ready to move", className: "border-[#bfdfc3] bg-[#eff8ed] text-[#2d6d36]" };
  if (status === "redo_required") return { label: "Rework required", className: "border-[#f1c797] bg-[#fff1e5] text-[#9a4b17]" };
  if (status === "blocked" || status === "failed") return { label: status === "blocked" ? "Blocked" : "Failed", className: "border-[#efc3be] bg-[#fff0ee] text-[#a33a2b]" };
  if (status === "completed") return { label: "Complete", className: "border-[#bfdfc3] bg-[#eff8ed] text-[#2d6d36]" };
  return fallbackStatus === "queued"
    ? { label: "Not started", className: "border-[#deded8] bg-[#f4f4f1] text-[#64645e]" }
    : { label: "In progress", className: "border-[#bfd8f0] bg-[#edf6fd] text-[#245b87]" };
}

export function CurrentStepCard({ tile }: { tile: WaferStatusTileModel }) {
  const processSteps = tile.processSteps ?? [];
  const currentStep = processSteps.find((step) =>
    step.id === tile.currentStepId || (!tile.currentStepId && step.name === tile.stepLabel)
  ) ?? null;
  const mainSteps = processSteps.filter((step) => step.executionMode === "main");
  const currentMainStepIndex = currentStep ? mainSteps.findIndex((step) => step.id === currentStep.id) : -1;
  const totalSteps = mainSteps.length;
  const completedMainSteps = mainSteps.filter((step) => ["completed", "skipped"].includes(step.status)).length;
  const stepNumber = currentMainStepIndex >= 0 ? currentMainStepIndex + 1 : completedMainSteps;
  const progressPercent = totalSteps ? Math.round((stepNumber / totalSteps) * 100) : 0;
  const details = [
    ["Started", formatStepTimestamp(currentStep?.startedAt)],
    ["Completed", formatStepTimestamp(currentStep?.completedAt)],
    ["Operator", currentStep?.noteAuthorName ?? "Unassigned"]
  ];
  const statusPresentation = stepStatusPresentation(currentStep?.status, tile.status);

  return (
    <DetailCard title="Current step">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-semibold leading-none text-[#111111]">{tile.stepLabel}</h2>
        <span className={`rounded-md border px-2 py-1 text-[12px] font-semibold ${statusPresentation.className}`}>
          {statusPresentation.label}
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
