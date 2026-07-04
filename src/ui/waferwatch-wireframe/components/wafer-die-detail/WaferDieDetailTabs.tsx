import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import {
  CurrentStepCard,
  DiePreviewCard,
  KeyResultsCard,
  NotesCard,
  PerformanceTrendCard,
  QuickInfoCard
} from "./DieSummaryCards";
import { ParametersTableCard } from "./ParametersTableCard";
import { ProcessTimelineCard } from "./ProcessTimelineCard";
import { ResultsSequenceCard } from "./ResultsSequenceCard";
import { recentNotes, type DieDetailTab } from "./waferDieDetailData";

function DieOverviewTab({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-3">
        <DiePreviewCard tile={tile} />
        <CurrentStepCard tile={tile} />
        <QuickInfoCard tile={tile} />
        <ProcessTimelineCard />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <PerformanceTrendCard />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieHistoryTab() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ProcessTimelineCard />
      <aside className="grid content-start gap-4">
        <PerformanceTrendCard />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieParametersTab({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ParametersTableCard />
      <aside className="grid content-start gap-4">
        <CurrentStepCard tile={tile} />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieResultsTab() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <ResultsSequenceCard />
        <ParametersTableCard />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <PerformanceTrendCard />
      </aside>
    </div>
  );
}

function DieNotesTab() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <DetailCard title="Notes" className="min-h-[520px]">
        <div className="grid gap-3">
          {recentNotes.map((note) => (
            <article key={`${note.author}-${note.time}-expanded`} className="rounded-2xl border border-[#ecece1] bg-[#fafaf5] p-5">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={[
                    "grid h-7 w-7 place-items-center rounded-lg text-[12px] font-semibold text-white",
                    note.tone === "green" ? "bg-[#6b7f57]" : "bg-[#d9a441]"
                  ].join(" ")}
                >
                  {note.author[0]}
                </span>
                <strong className="text-[14px] text-[#151512]">{note.author}</strong>
                <span className="text-[13px] font-medium text-[#98968a]">{note.time}</span>
              </div>
              <p className="text-[14px] leading-6 text-[#4a483f]">{note.body}</p>
            </article>
          ))}
          <button
            type="button"
            className="h-11 rounded-xl border border-[#e1e1d7] bg-white text-[14px] font-semibold text-[#4a483f] hover:bg-[#f8f8f1]"
          >
            + Add note
          </button>
        </div>
      </DetailCard>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <PerformanceTrendCard />
      </aside>
    </div>
  );
}

export function WaferDieDetailTabs({
  activeTab,
  tile
}: {
  activeTab: DieDetailTab;
  tile: WaferStatusTileModel;
}) {
  if (activeTab === "history") return <DieHistoryTab />;
  if (activeTab === "parameters") return <DieParametersTab tile={tile} />;
  if (activeTab === "results") return <DieResultsTab />;
  if (activeTab === "notes") return <DieNotesTab />;
  return <DieOverviewTab tile={tile} />;
}
