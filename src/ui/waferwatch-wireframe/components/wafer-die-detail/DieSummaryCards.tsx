import type { WaferStatusTileModel } from "../../types";
import { WaferGeometryPreview } from "../WaferGeometryPreview";
import { DetailCard } from "./DetailCard";
import { ResultTrendChart } from "./ResultTrendChart";
import { recentNotes, resultMetrics } from "./waferDieDetailData";
import { getDieIdentity, getSelectedDieLabel, statusLabel } from "./waferDieDetailHelpers";

export function DiePreviewCard({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <DetailCard title="Die preview">
      <div className="grid min-h-[220px] place-items-center rounded-xl bg-[#f8f8f1] p-6">
        <WaferGeometryPreview
          modeKeyword={tile.waferStateName}
          selectedLabel={getSelectedDieLabel(tile)}
          selectedDieCode={tile.dieLabel || tile.code}
          colorSeed={tile.family}
          showOnlySelectedDie
          showDieLabel={false}
          className="max-h-[210px]"
        />
      </div>
      <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-[#e8e8de] bg-[#fbfbf6] text-center text-[13px] font-semibold text-[#6b6a5f]">
        {["Front", "Back", "3D"].map((view, index) => (
          <button
            key={view}
            type="button"
            className={[
              "h-10 hover:bg-white",
              index === 0 ? "bg-white text-[#151512] shadow-[0_8px_18px_-16px_rgba(30,29,22,0.45)]" : "border-l border-[#ecece1]"
            ].join(" ")}
          >
            {view}
          </button>
        ))}
      </div>
    </DetailCard>
  );
}

export function CurrentStepCard({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <DetailCard title="Current step">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-semibold leading-none text-[#151512]">{tile.stepLabel}</h2>
        <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] font-semibold text-[#4f7a43]">
          {statusLabel(tile)}
        </span>
      </div>
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[#6b6a5f]">
          <span>Step 4 of 8</span>
          <span>50%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#ecece3]">
          <div className="h-full w-1/2 rounded-full bg-[#6b7f57]" />
        </div>
      </div>
      <dl className="mt-8 grid gap-5 text-[14px]">
        {[
          ["Started", "Jul 1, 2025 - 10:42 AM"],
          ["Est. completion", "Jul 1, 2025 - 2:00 PM"],
          ["Operator", "adam"]
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-4">
            <dt className="font-medium text-[#8a887b]">{label}</dt>
            <dd className="font-semibold text-[#151512]">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailCard>
  );
}

export function QuickInfoCard({ tile }: { tile: WaferStatusTileModel }) {
  const identity = getDieIdentity(tile);
  const rows = [
    ["Wafer", tile.family],
    ["Die ID", identity.dieId],
    ["Material", identity.material],
    ["Dimensions", identity.dimensions],
    ["Thickness", identity.thickness],
    ["Orientation", identity.orientation],
    ["Created", "Jun 28, 2025"],
    ["Status", "Active"]
  ];

  return (
    <DetailCard title="Quick info">
      <dl className="grid gap-4 text-[14px]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
            <dt className="font-medium text-[#8a887b]">{label}</dt>
            <dd className="font-semibold text-[#151512]">
              {label === "Status" ? (
                <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] text-[#4f7a43]">{value}</span>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </DetailCard>
  );
}

export function KeyResultsCard() {
  return (
    <DetailCard title="Key results (latest)" action="View all">
      <div className="grid grid-cols-2 gap-3">
        {resultMetrics.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#fafaf5] p-4">
            <p className="text-[12px] font-medium text-[#8a887b]">{label}</p>
            <p className="mt-1 text-[16px] font-semibold text-[#151512]">{value}</p>
          </div>
        ))}
      </div>
    </DetailCard>
  );
}

export function PerformanceTrendCard() {
  return (
    <DetailCard title="Performance trend" action="View details">
      <ResultTrendChart />
      <div className="mt-1 flex justify-between text-[11px] font-medium text-[#8a887b]">
        <span>Step 1</span>
        <span>Step 2</span>
        <span>Step 3</span>
        <span>Step 4</span>
      </div>
    </DetailCard>
  );
}

export function NotesCard() {
  return (
    <DetailCard title="Notes (latest)" action="View all">
      <div className="grid gap-3">
        {recentNotes.map((note) => (
          <article key={`${note.author}-${note.time}`} className="rounded-xl bg-[#fafaf5] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={[
                  "grid h-5 w-5 place-items-center rounded-md text-[11px] font-semibold text-white",
                  note.tone === "green" ? "bg-[#6b7f57]" : "bg-[#d9a441]"
                ].join(" ")}
              >
                {note.author[0]}
              </span>
              <strong className="text-[13px] text-[#151512]">{note.author}</strong>
              <span className="text-[12px] font-medium text-[#98968a]">{note.time}</span>
            </div>
            <p className="text-[13px] leading-5 text-[#4a483f]">{note.body}</p>
          </article>
        ))}
        <button
          type="button"
          className="mt-1 h-10 rounded-xl border border-[#e1e1d7] bg-white text-[14px] font-semibold text-[#4a483f] hover:bg-[#f8f8f1]"
        >
          + Add note
        </button>
      </div>
    </DetailCard>
  );
}
