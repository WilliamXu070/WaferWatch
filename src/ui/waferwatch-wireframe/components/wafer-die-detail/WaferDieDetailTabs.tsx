"use client";

import { useState } from "react";
import type { WaferStatusTileModel } from "../../types";
import {
  CurrentStepCard,
  KeyResultsCard
} from "./DieSummaryCards";
import { DieAppearanceCard } from "./DieAppearanceCard";
import { DetailCard } from "./DetailCard";
import { ParametersTableCard } from "./ParametersTableCard";
import { ResultsReviewBoard } from "./ResultsReviewBoard";
import {
  flattenStepNotes,
  getInitialWaferDieNotes,
  getInitialWaferDieNotesByStep,
  NotesCard,
  WaferDieNotesDashboard,
  type WaferDieNote,
  type WaferDieNoteViewer
} from "./WaferDieNotes";
import { isPolingStepName, type DieDetailTab } from "./waferDieDetailData";

function hasPolingWorkflow(tile: WaferStatusTileModel) {
  return tile.processSteps?.some((step) => isPolingStepName(step.name)) ?? false;
}

function EmptyProcessData({ title, message }: { title: string; message: string }) {
  return (
    <DetailCard title={title} className="lg:col-span-3">
      <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-[#ddddda] bg-white px-6 text-center">
        <p className="max-w-md text-[14px] font-medium leading-6 text-[#777770]">{message}</p>
      </div>
    </DetailCard>
  );
}

function DieOverviewTab({
  tile,
  notes,
  canEdit,
  currentUser,
  onOpenNotes
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
  onOpenNotes: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-2">
        <DieAppearanceCard tile={tile} canEdit={canEdit} />
        <CurrentStepCard tile={tile} />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <NotesCard notes={notes} currentUser={currentUser} onOpenNotes={onOpenNotes} />
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
  if (!hasPolingWorkflow(tile)) {
    return <EmptyProcessData title="Parameters" message="No parameter workflow is configured for this process." />;
  }

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
  if (!hasPolingWorkflow(tile)) {
    return <EmptyProcessData title="Results" message="No result collection workflow is configured for this process." />;
  }

  return <ResultsReviewBoard tile={tile} canEdit={canEdit} />;
}

function DieNotesTab({
  tile,
  canEdit,
  currentUser,
  notesByStepId,
  onNotesChange
}: {
  tile: WaferStatusTileModel;
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
  notesByStepId: Record<string, readonly WaferDieNote[]>;
  onNotesChange: (stepId: string, notes: WaferDieNote[]) => void;
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
      />
    </div>
  );
}

export function WaferDieDetailTabs({
  activeTab,
  tile,
  canEdit,
  currentUser,
  onOpenNotes
}: {
  activeTab: DieDetailTab;
  tile: WaferStatusTileModel;
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
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

  if (activeTab === "parameters") return <DieParametersTab tile={tile} canEdit={canEdit} onPolingNotesChange={setStepNotes} />;
  if (activeTab === "results") return <DieResultsTab tile={tile} canEdit={canEdit} />;
  if (activeTab === "notes") {
    return <DieNotesTab tile={tile} canEdit={canEdit} currentUser={currentUser} notesByStepId={notesByStepId} onNotesChange={setStepNotes} />;
  }
  return <DieOverviewTab tile={tile} notes={notes} canEdit={canEdit} currentUser={currentUser} onOpenNotes={onOpenNotes} />;
}
