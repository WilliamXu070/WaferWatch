import { useState } from "react";
import type { PointerEvent, RefObject } from "react";
import { Archive, RotateCcw, X } from "lucide-react";
import type { FlowNode, ProcessArchiveItem } from "./types";

type ProcessArchiveDockProps = {
  archiveItems: readonly ProcessArchiveItem[];
  canEdit: boolean;
  dockRef: RefObject<HTMLButtonElement | null>;
  isBusy: boolean;
  isDropActive: boolean;
  isDropEligible: boolean;
  isReceived: boolean;
  isOpen: boolean;
  statusMessage: string | null;
  steps: readonly FlowNode[];
  onBeginRestoreDrag: (event: PointerEvent<HTMLButtonElement>, item: ProcessArchiveItem) => void;
  onClose: () => void;
  onRestoreToStep: (item: ProcessArchiveItem, stepId: string) => void;
  onToggle: () => void;
};

function formatArchiveDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Archived"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ProcessArchiveDock({
  archiveItems,
  canEdit,
  dockRef,
  isBusy,
  isDropActive,
  isDropEligible,
  isReceived,
  isOpen,
  statusMessage,
  steps,
  onBeginRestoreDrag,
  onClose,
  onRestoreToStep,
  onToggle
}: ProcessArchiveDockProps) {
  const [restoreStepByWafer, setRestoreStepByWafer] = useState<Record<string, string>>({});
  const countLabel = archiveItems.length === 1 ? "1 archived item" : `${archiveItems.length} archived items`;

  return (
    <>
      {isOpen ? (
        <aside aria-label="Completed wafer archive" className="flow-archive-drawer">
          <header className="flow-archive-drawer__header">
            <div>
              <span className="flow-archive-drawer__eyebrow">Completed work</span>
              <h2>Archive</h2>
            </div>
            <button aria-label="Close archive" className="flow-archive-icon-button" onClick={onClose} type="button">
              <X aria-hidden size={17} strokeWidth={1.9} />
            </button>
          </header>
          <p className="flow-archive-drawer__hint">
            Drag an item onto a step&apos;s Beginning lane to start a new run there.
          </p>
          <div className="flow-archive-list">
            {archiveItems.length ? archiveItems.map((item) => {
              const label = item.dieLabel ?? item.waferCode;
              const selectedStepId = restoreStepByWafer[item.waferId] ?? steps[0]?.id ?? "";
              return (
                <article className="flow-archive-item" key={item.waferId}>
                  <button
                    aria-label={`Drag ${label} back to a Beginning lane`}
                    className="flow-archive-item__drag"
                    disabled={!canEdit || isBusy}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "touch") onBeginRestoreDrag(event, item);
                    }}
                    type="button"
                  >
                    <span className="flow-archive-item__chip">{label}</span>
                    <span className="flow-archive-item__meta">
                      <strong>{formatArchiveDate(item.archivedAt)}</strong>
                      <span>{item.archivedByName ? `by ${item.archivedByName}` : "Completed run preserved"}</span>
                    </span>
                  </button>
                  <div className="flow-archive-item__mobile-restore">
                    <label>
                      <span>Restore to</span>
                      <select
                        disabled={!canEdit || isBusy}
                        onChange={(event) => setRestoreStepByWafer((current) => ({
                          ...current,
                          [item.waferId]: event.currentTarget.value
                        }))}
                        value={selectedStepId}
                      >
                        {steps.map((step) => <option key={step.id} value={step.id}>{step.label} · Beginning</option>)}
                      </select>
                    </label>
                    <button
                      className="button button-secondary"
                      disabled={!canEdit || isBusy || !selectedStepId}
                      onClick={() => onRestoreToStep(item, selectedStepId)}
                      type="button"
                    >
                      <RotateCcw aria-hidden size={15} /> Restore
                    </button>
                  </div>
                </article>
              );
            }) : (
              <div className="flow-archive-empty">
                <Archive aria-hidden size={22} strokeWidth={1.6} />
                <strong>No archived work</strong>
                <span>Completed wafers and dies dropped here will remain available.</span>
              </div>
            )}
          </div>
        </aside>
      ) : null}

      <button
        ref={dockRef}
        aria-expanded={isOpen}
        aria-label={`Open archive, ${countLabel}`}
        className={[
          "flow-archive-dock",
          isOpen ? "flow-archive-dock--open" : "",
          isDropActive ? "flow-archive-dock--drop-active" : "",
          isDropActive && !isDropEligible ? "flow-archive-dock--drop-rejected" : "",
          isReceived ? "flow-archive-dock--received" : ""
        ].filter(Boolean).join(" ")}
        onClick={onToggle}
        type="button"
      >
        <span className="flow-archive-dock__slot" aria-hidden />
        <Archive aria-hidden size={20} strokeWidth={1.8} />
        <span className="flow-archive-dock__label">
          <strong>{isDropActive ? (isDropEligible ? "Release to archive" : "Completed work only") : "Archive"}</strong>
          <span>{isDropActive ? "" : countLabel}</span>
        </span>
        {archiveItems.length ? <span className="flow-archive-dock__count">{archiveItems.length}</span> : null}
      </button>
      {statusMessage ? <p aria-live="polite" className="flow-archive-status">{statusMessage}</p> : null}
    </>
  );
}
