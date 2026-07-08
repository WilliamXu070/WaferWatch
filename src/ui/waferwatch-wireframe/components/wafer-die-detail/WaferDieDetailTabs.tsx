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
import { ResultsReviewBoard } from "./ResultsReviewBoard";
import {
  flattenStepNotes,
  getInitialWaferDieNotes,
  getInitialWaferDieNotesByStep,
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
  canEdit,
  onPolingNotesChange
}: {
  tile: WaferStatusTileModel;
  canEdit: boolean;
  onPolingNotesChange: (stepId: string, notes: WaferDieNote[]) => void;
}) {
  return (
    <div className="grid gap-4">
      <ParametersTableCard
        key={`parameters-${tile.id}`}
        tile={tile}
        canEdit={canEdit}
        onPolingNotesChange={onPolingNotesChange}
      />
    </div>
  );
}

function DieResultsTab({ tile, canEdit }: { tile: WaferStatusTileModel; canEdit: boolean }) {
  return <ResultsReviewBoard tile={tile} canEdit={canEdit} />;
}

function DieNotesTab({
  tile,
  canEdit,
  notesByStepId,
  onNotesChange
}: {
  tile: WaferStatusTileModel;
  canEdit: boolean;
  notesByStepId: Record<string, readonly WaferDieNote[]>;
  onNotesChange: (stepId: string, notes: WaferDieNote[]) => void;
}) {
  return (
    <div className="grid gap-4">
      <WaferDieNotesDashboard
        key={tile.id}
        tile={tile}
        canEdit={canEdit}
        notesByStepId={notesByStepId}
        onNotesChange={onNotesChange}
      />
    </div>
  );
}

export function WaferDieDetailTabs({
  activeTab,
  tile,
  canEdit,
  onOpenNotes
}: {
  activeTab: DieDetailTab;
  tile: WaferStatusTileModel;
  canEdit: boolean;
  onOpenNotes: () => void;
}) {
  const [notesByStepId, setNotesByStepId] = useState<Record<string, WaferDieNote[]>>(() =>
    getInitialWaferDieNotesByStep(tile)
  );
  const notes = tile.processSteps?.length ? flattenStepNotes(notesByStepId) : getInitialWaferDieNotes(tile);
  const setStepNotes = (stepId: string, notesForStep: WaferDieNote[]) => {
    setNotesByStepId((current) => ({
      ...current,
      [stepId]: notesForStep
    }));
  };

  if (activeTab === "history") return <DieHistoryTab tile={tile} notes={notes} onOpenNotes={onOpenNotes} />;
  if (activeTab === "parameters") return <DieParametersTab tile={tile} canEdit={canEdit} onPolingNotesChange={setStepNotes} />;
  if (activeTab === "results") return <DieResultsTab tile={tile} canEdit={canEdit} />;
  if (activeTab === "notes") {
    return <DieNotesTab tile={tile} canEdit={canEdit} notesByStepId={notesByStepId} onNotesChange={setStepNotes} />;
  }
  return <DieOverviewTab tile={tile} notes={notes} onOpenNotes={onOpenNotes} />;
}
