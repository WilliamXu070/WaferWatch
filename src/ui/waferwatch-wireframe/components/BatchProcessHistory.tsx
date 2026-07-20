import { ClockIcon } from "../icons";
import type {
  BatchProcessHistoryItem,
  BatchProcessHistoryStatus
} from "../types";

const STATUS_PRESENTATION: Record<
  BatchProcessHistoryStatus,
  { label: string; className: string }
> = {
  awaiting_review: {
    label: "Awaiting review",
    className: "border-[#deddd0] bg-[#f4f4ea] text-[#626055]"
  },
  approved: {
    label: "Approved",
    className: "border-[#cdd8c7] bg-[#eef3ea] text-[#486044]"
  },
  redo: {
    label: "Redo",
    className: "border-[#e2cfc5] bg-[#f8eee9] text-[#874c38]"
  },
  withdrawn: {
    label: "Withdrawn",
    className: "border-[#deddd7] bg-[#f4f4f1] text-[#797871]"
  },
  mixed: {
    label: "Mixed",
    className: "border-[#ddd5bd] bg-[#f7f2e4] text-[#756338]"
  }
};

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

export function BatchProcessHistoryCard({ item }: { item: BatchProcessHistoryItem }) {
  const status = STATUS_PRESENTATION[item.status];

  return (
    <article className="dashboard-history-card flex min-w-0 flex-col border border-[#e4e3d8] bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#99978a]">
            Batch process
          </p>
          <h3 className="mt-1.5 text-[18px] font-semibold leading-tight tracking-tight text-[#151512]">
            {item.processName}
          </h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
          {status.label}
        </span>
      </header>

      <div className="mt-4 border-t border-[#ecebe2] pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#8a887b]">
            Samples
          </p>
          <span className="text-[11px] font-medium text-[#9a988c]">
            {item.samples.length}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.samples.map((sample) => (
            <span
              key={sample.attemptId}
              title={`${sample.label} · ${STATUS_PRESENTATION[sample.status].label}`}
              className="rounded-md border border-[#e1e0d5] bg-[#f7f7f1] px-2 py-1 text-[11px] font-semibold text-[#56544b]"
            >
              {sample.label}
            </span>
          ))}
        </div>
      </div>

      {item.note ? (
        <p className="mt-4 whitespace-pre-wrap border-t border-[#ecebe2] pt-3 text-[13px] leading-5 text-[#66645b]">
          {item.note}
        </p>
      ) : null}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-5 text-[11px] font-medium text-[#88867b]">
        <span>{item.operatorName}</span>
        <time dateTime={item.submittedAt} className="inline-flex items-center gap-1.5">
          <ClockIcon />
          {formatHistoryTime(item.submittedAt)}
        </time>
      </footer>
    </article>
  );
}
