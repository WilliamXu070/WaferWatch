"use client";

import { useState } from "react";
import type { WaferStatusTileModel } from "../../types";
import {
  CurrentStepCard,
  DiePreviewCard,
  KeyResultsCard
} from "./DieSummaryCards";
import { ParametersTableCard } from "./ParametersTableCard";
import { ProcessTimelineCard } from "./ProcessTimelineCard";
import { ResultsSequenceCard } from "./ResultsSequenceCard";
import {
  getInitialWaferDieNotes,
  NotesCard,
  WaferDieNotesDashboard,
  type WaferDieNote
} from "./WaferDieNotes";
import { type DieDetailTab } from "./waferDieDetailData";

function DieOverviewTab({
  tile,
  notes,
  onOpenNotes
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  onOpenNotes: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-2">
        <DiePreviewCard tile={tile} />
        <CurrentStepCard tile={tile} />
        <ProcessTimelineCard tile={tile} />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <NotesCard notes={notes} onOpenNotes={onOpenNotes} />
      </aside>
    </div>
  );
}

function DieHistoryTab({
  tile,
  notes,
  onOpenNotes
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  onOpenNotes: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ProcessTimelineCard tile={tile} />
      <aside className="grid content-start gap-4">
        <NotesCard notes={notes} onOpenNotes={onOpenNotes} />
      </aside>
    </div>
  );
}

function DieParametersTab({
  tile,
  notes,
  onOpenNotes
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  onOpenNotes: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ParametersTableCard key={`parameters-${tile.id}`} tile={tile} />
      <aside className="grid content-start gap-4">
        <CurrentStepCard tile={tile} />
        <NotesCard notes={notes} onOpenNotes={onOpenNotes} />
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

function DieNotesTab({
  tile,
  notes,
  onNotesChange
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  onNotesChange: (notes: WaferDieNote[]) => void;
}) {
  return (
    <div className="grid gap-4">
      <WaferDieNotesDashboard
        key={tile.id}
        tile={tile}
        notes={notes}
        onNotesChange={onNotesChange}
      />
    </div>
  );
}

export function WaferDieDetailTabs({
  activeTab,
  tile,
  onOpenNotes
}: {
  activeTab: DieDetailTab;
  tile: WaferStatusTileModel;
  onOpenNotes: () => void;
}) {
  const [notes, setNotes] = useState<WaferDieNote[]>(() => getInitialWaferDieNotes(tile));

  if (activeTab === "history") return <DieHistoryTab tile={tile} notes={notes} onOpenNotes={onOpenNotes} />;
  if (activeTab === "parameters") return <DieParametersTab tile={tile} notes={notes} onOpenNotes={onOpenNotes} />;
  if (activeTab === "results") return <DieResultsTab tile={tile} />;
  if (activeTab === "notes") return <DieNotesTab tile={tile} notes={notes} onNotesChange={setNotes} />;
  return <DieOverviewTab tile={tile} notes={notes} onOpenNotes={onOpenNotes} />;
}
