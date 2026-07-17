"use client";

import { useState } from "react";
import type { WaferStatusTileModel } from "../../types";
import {
  CurrentStepCard,
  KeyResultsCard
} from "./DieSummaryCards";
import { DieAppearanceCard } from "./DieAppearanceCard";
import {
  flattenStepNotes,
  getInitialWaferDieNotes,
  getInitialWaferDieNotesByStep,
  NotesCard,
  WaferDieNotesDashboard,
  type WaferDieNote,
  type WaferDieNoteViewer
} from "./WaferDieNotes";
import { type DieDetailTab } from "./waferDieDetailData";

function DieOverviewTab({
  tile,
  notes,
  canEdit,
  currentUser,
  onOpenHistory
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
  onOpenHistory: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-2">
        <DieAppearanceCard tile={tile} canEdit={canEdit} />
        <CurrentStepCard tile={tile} />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <NotesCard notes={notes} currentUser={currentUser} onOpenNotes={onOpenHistory} />
      </aside>
    </div>
  );
}

function DieProcessHistoryTab({
  tile,
  canEdit,
  currentUser,
  notesByStepId,
  onNotesChange,
  selectedVisitId,
  onSelectedVisitChange
}: {
  tile: WaferStatusTileModel;
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
  notesByStepId: Record<string, readonly WaferDieNote[]>;
  onNotesChange: (stepId: string, notes: WaferDieNote[]) => void;
  selectedVisitId: string | null;
  onSelectedVisitChange: (visitId: string) => void;
}) {
  return (
    <div className="wafer-die-notes-tab min-h-0">
      <WaferDieNotesDashboard
        key={tile.id}
        tile={tile}
        canEdit={canEdit}
        currentUser={currentUser}
        notesByStepId={notesByStepId}
        onNotesChange={onNotesChange}
        selectedVisitId={selectedVisitId}
        onSelectedVisitChange={onSelectedVisitChange}
      />
    </div>
  );
}

export function WaferDieDetailTabs({
  activeTab,
  tile,
  canEdit,
  currentUser,
  onOpenHistory,
  selectedVisitId,
  onSelectedVisitChange
}: {
  activeTab: DieDetailTab;
  tile: WaferStatusTileModel;
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
  onOpenHistory: () => void;
  selectedVisitId: string | null;
  onSelectedVisitChange: (visitId: string) => void;
}) {
  const [notesByStepId, setNotesByStepId] = useState<Record<string, WaferDieNote[]>>(() =>
    getInitialWaferDieNotesByStep(tile)
  );
  const notes = tile.processSteps?.length
    ? [...getInitialWaferDieNotes(tile), ...flattenStepNotes(notesByStepId)]
    : getInitialWaferDieNotes(tile);
  const setStepNotes = (stepId: string, notesForStep: WaferDieNote[]) => {
    setNotesByStepId((current) => ({
      ...current,
      [stepId]: notesForStep
    }));
  };

  if (activeTab === "history") {
    return (
      <DieProcessHistoryTab
        tile={tile}
        canEdit={canEdit}
        currentUser={currentUser}
        notesByStepId={notesByStepId}
        onNotesChange={setStepNotes}
        selectedVisitId={selectedVisitId}
        onSelectedVisitChange={onSelectedVisitChange}
      />
    );
  }
  return <DieOverviewTab tile={tile} notes={notes} canEdit={canEdit} currentUser={currentUser} onOpenHistory={onOpenHistory} />;
}
