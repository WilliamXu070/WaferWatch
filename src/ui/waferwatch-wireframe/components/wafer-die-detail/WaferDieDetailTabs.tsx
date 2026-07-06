import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import {
  CurrentStepCard,
  DiePreviewCard,
  KeyResultsCard,
  NotesCard
} from "./DieSummaryCards";
import { ParametersTableCard } from "./ParametersTableCard";
import { ProcessTimelineCard } from "./ProcessTimelineCard";
import { ResultsSequenceCard } from "./ResultsSequenceCard";
import { recentNotes, type DieDetailTab } from "./waferDieDetailData";

function DieOverviewTab({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-2">
        <DiePreviewCard tile={tile} />
        <CurrentStepCard tile={tile} />
        <ProcessTimelineCard tile={tile} />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieHistoryTab({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ProcessTimelineCard tile={tile} />
      <aside className="grid content-start gap-4">
        <NotesCard />
      </aside>
    </div>
  );
}

function DieParametersTab({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ParametersTableCard key={`parameters-${tile.id}`} tile={tile} />
      <aside className="grid content-start gap-4">
        <CurrentStepCard tile={tile} />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieResultsTab({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <ResultsSequenceCard />
        <ParametersTableCard key={`results-parameters-${tile.id}`} tile={tile} />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
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
            <article key={`${note.author}-${note.time}-expanded`} className="border-b border-[#eeeeea] py-5">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={[
                    "grid h-7 w-7 place-items-center rounded-lg text-[12px] font-semibold text-white",
                    "bg-[#111111]"
                  ].join(" ")}
                >
                  {note.author[0]}
                </span>
                <strong className="text-[14px] text-[#111111]">{note.author}</strong>
                <span className="text-[13px] font-medium text-[#8a8a83]">{note.time}</span>
              </div>
              <p className="text-[14px] leading-6 text-[#44443f]">{note.body}</p>
            </article>
          ))}
          <button
            type="button"
            className="h-11 rounded-lg border border-[#e1e1dc] bg-white text-[14px] font-semibold text-[#44443f] hover:bg-[#fafafa]"
          >
            + Add note
          </button>
        </div>
      </DetailCard>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
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
  if (activeTab === "history") return <DieHistoryTab tile={tile} />;
  if (activeTab === "parameters") return <DieParametersTab tile={tile} />;
  if (activeTab === "results") return <DieResultsTab tile={tile} />;
  if (activeTab === "notes") return <DieNotesTab />;
  return <DieOverviewTab tile={tile} />;
}
