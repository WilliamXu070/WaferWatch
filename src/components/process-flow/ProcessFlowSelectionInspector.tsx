"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Layers3,
  MoveRight,
  RotateCcw,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  getProcessFlowSelectionParameterDetail,
  saveWaferStatusStepParameterRecord
} from "@/features/process-flows/actions";
import type { Json, StepStatus } from "@/types/database";
import { StepParameterHistory } from "@/ui/waferwatch-wireframe/components/wafer-die-detail/StepParameterHistory";
import type { WaferStatusStepParameterRecord } from "@/ui/waferwatch-wireframe/types";
import {
  getSelectionKindLabel,
  getSingleSelectionDeleteLabel,
  getVisibleSelectionStack,
  isSingleSelection
} from "./selectionInspectorState";
import type { ProcessFlowSyncState } from "./types";
import { getVisualViewportBottomInset } from "./visualViewportInset";

export type ProcessFlowInspectorItem = {
  assignmentId: string;
  waferId?: string;
  projectId?: string;
  processTemplateId?: string;
  stepId: string;
  stepName: string;
  stepExecutionId?: string | null;
  parametersSchema: Json;
  waferCode: string;
  dieLabel: string | null;
  label: string;
  isDie: boolean;
  status: StepStatus | null;
  handlerName?: string | null;
  latestNote?: string | null;
  syncState?: ProcessFlowSyncState;
  canSubmitCheckpoint: boolean;
};

type SelectionInspectorProps = {
  items: readonly ProcessFlowInspectorItem[];
  moveTargets: readonly { id: string; label: string }[];
  canEdit: boolean;
  canDelete: boolean;
  canUndoMovement: boolean;
  isPending: boolean;
  onActivate: (assignmentId: string) => void;
  onClear: () => void;
  onDelete: () => void;
  onRemove: (assignmentId: string) => void;
  onMove: (targetId: string) => void;
  onOpenFullRecord: () => void;
  onParameterDirtyChange: (isDirty: boolean) => void;
  onSubmitCheckpoint: () => void;
  onUndoMovement: () => void;
};

function statusLabel(status: StepStatus | null) {
  if (!status) return "Not started";
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function useVisualViewportBottomInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateInset = () => {
      const nextInset = getVisualViewportBottomInset({
        layoutViewportHeight: window.innerHeight,
        visualViewportHeight: viewport.height,
        visualViewportOffsetTop: viewport.offsetTop
      });
      setInset((current) => current === nextInset ? current : nextInset);
    };

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    window.addEventListener("resize", updateInset);
    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
      window.removeEventListener("resize", updateInset);
    };
  }, []);

  return inset;
}

export function SelectionStackVisual({
  items,
  onActivate
}: {
  items: readonly ProcessFlowInspectorItem[];
  onActivate: (assignmentId: string) => void;
}) {
  const { visibleItems, hiddenCount } = getVisibleSelectionStack(items);

  return (
    <div
      aria-label={`${getSelectionKindLabel(items)}; ${items.at(-1)?.label ?? "item"} active`}
      className="process-flow-selection-stack"
    >
      {visibleItems.map((item, index) => {
        const isActive = index === visibleItems.length - 1;
        return (
          <button
            aria-current={isActive ? "true" : undefined}
            aria-label={`${item.label}${isActive ? ", active" : ", make active"}`}
            className={`process-flow-selection-stack__card ${isActive ? "is-active" : ""}`}
            key={item.assignmentId}
            onClick={() => onActivate(item.assignmentId)}
            style={{ "--selection-stack-index": index } as CSSProperties}
            type="button"
          >
            <span className={`process-flow-selection-stack__shape ${item.isDie ? "is-die" : "is-wafer"}`} aria-hidden>
              {item.isDie
                ? Array.from({ length: 6 }, (_, cell) => <i key={cell} />)
                : <i />}
            </span>
            <strong>{item.label}</strong>
            <small>{statusLabel(item.status)}</small>
          </button>
        );
      })}
      {hiddenCount > 0 ? <span className="process-flow-selection-stack__count">+{hiddenCount}</span> : null}
    </div>
  );
}

function SelectionParameterPanel({
  item,
  canEdit,
  onDirtyChange
}: {
  item: ProcessFlowInspectorItem;
  canEdit: boolean;
  onDirtyChange: (isDirty: boolean) => void;
}) {
  const exactIdentity = useMemo(() => (
    item.processTemplateId && item.projectId && item.waferId && item.stepExecutionId
      ? {
          processTemplateId: item.processTemplateId,
          projectId: item.projectId,
          assignmentId: item.assignmentId,
          waferId: item.waferId,
          stepId: item.stepId,
          stepExecutionId: item.stepExecutionId
        }
      : null
  ), [
    item.assignmentId,
    item.processTemplateId,
    item.projectId,
    item.stepExecutionId,
    item.stepId,
    item.waferId
  ]);
  const [records, setRecords] = useState<WaferStatusStepParameterRecord[] | null>(null);
  const [parametersSchema, setParametersSchema] = useState<Json>(item.parametersSchema);
  const [error, setError] = useState<string | null>(() => exactIdentity
    ? null
    : "Parameters become available after this item enters a recorded step visit.");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onDirtyChange(false);
    if (!exactIdentity) {
      return () => { cancelled = true; };
    }

    void getProcessFlowSelectionParameterDetail(exactIdentity).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setParametersSchema(result.data.parametersSchema);
      setRecords(result.data.records);
    });
    return () => {
      cancelled = true;
      onDirtyChange(false);
    };
  }, [exactIdentity, onDirtyChange, refreshKey]);

  const saveParameters = useCallback(async (input: unknown) => {
    if (!exactIdentity) {
      return { ok: false as const, error: "This step visit is no longer available." };
    }
    return saveWaferStatusStepParameterRecord({
      ...(input as Record<string, unknown>),
      processTemplateId: exactIdentity.processTemplateId,
      assignmentId: exactIdentity.assignmentId
    });
  }, [exactIdentity]);

  if (error) {
    return (
      <section className="process-flow-selection-inspector__notice" aria-label="Parameters unavailable">
        <strong>Parameters unavailable</strong>
        <p>{error}</p>
      </section>
    );
  }
  if (!records) {
    return (
      <section className="process-flow-selection-inspector__parameter-loading" aria-label="Loading parameters">
        <span />
        <span />
        <span />
      </section>
    );
  }

  return (
    <StepParameterHistory
      key={`${item.assignmentId}:${item.stepExecutionId}:${refreshKey}`}
      records={records}
      templateSchema={parametersSchema}
      projectId={item.projectId ?? ""}
      waferId={item.waferId ?? ""}
      stepId={item.stepId}
      stepExecutionId={item.stepExecutionId ?? null}
      canEdit={canEdit}
      onDirtyChange={onDirtyChange}
      onSave={saveParameters}
      onSaved={() => {
        setRecords(null);
        setError(null);
        setRefreshKey((current) => current + 1);
      }}
      initiallyDirty={false}
      className="process-flow-selection-inspector__parameters"
    />
  );
}

export function ProcessFlowSelectionInspector({
  items,
  moveTargets,
  canEdit,
  canDelete,
  canUndoMovement,
  isPending,
  onActivate,
  onClear,
  onDelete,
  onRemove,
  onMove,
  onOpenFullRecord,
  onParameterDirtyChange,
  onSubmitCheckpoint,
  onUndoMovement
}: SelectionInspectorProps) {
  const activeItem = items.at(-1);
  const isSingle = isSingleSelection(items.length);
  const deleteLabel = getSingleSelectionDeleteLabel(items);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const keyboardInset = useVisualViewportBottomInset();
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      const label = statusLabel(item.status);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries());
  }, [items]);
  const syncedCount = items.filter((item) => !item.syncState || item.syncState === "synced").length;
  const failedCount = items.filter((item) => item.syncState === "failed").length;
  const submitEligibleCount = items.filter((item) => item.canSubmitCheckpoint).length;

  useEffect(() => {
    if (!isSingle) onParameterDirtyChange(false);
  }, [isSingle, onParameterDirtyChange]);

  if (!activeItem) return null;

  return (
    <aside
      className="process-flow-selection-inspector-host"
      aria-label="Process Flow selection inspector"
      style={{ "--process-flow-selection-inspector-keyboard-inset": `${keyboardInset}px` } as CSSProperties}
    >
      <section className={`process-flow-selection-inspector ${isMobileExpanded ? "is-mobile-expanded" : ""}`}>
        <header className="process-flow-selection-inspector__header">
          <div>
            <p>{getSelectionKindLabel(items)}</p>
            <h2>{isSingle ? activeItem.label : activeItem.stepName}</h2>
            <span>{isSingle ? activeItem.stepName : `${activeItem.label} active`}</span>
          </div>
          <div className="process-flow-selection-inspector__header-actions">
            <button
              aria-controls="process-flow-selection-inspector-body"
              aria-expanded={isMobileExpanded}
              className="process-flow-selection-inspector__mobile-toggle"
              onClick={() => setIsMobileExpanded((current) => !current)}
              type="button"
            >
              {isMobileExpanded ? "Less" : "Details"}
              <ChevronDown aria-hidden size={15} />
            </button>
            <button aria-label="Clear selected wafers or dies" className="process-flow-selection-inspector__icon-button" onClick={onClear} type="button">
              <X aria-hidden size={17} />
            </button>
          </div>
        </header>

        <div className="process-flow-selection-inspector__body" id="process-flow-selection-inspector-body">
          <SelectionStackVisual items={items} onActivate={onActivate} />

          {isSingle ? (
            <dl className="process-flow-selection-inspector__facts">
              <div>
                <dt><CheckCircle2 aria-hidden size={14} /> State</dt>
                <dd>{statusLabel(activeItem.status)}</dd>
              </div>
              <div>
                <dt><UserRound aria-hidden size={14} /> Handler</dt>
                <dd>{activeItem.handlerName?.trim() || "Unassigned"}</dd>
              </div>
              <div>
                <dt><Clock3 aria-hidden size={14} /> Sync</dt>
                <dd>{activeItem.syncState ? statusLabel(activeItem.syncState as StepStatus) : "Current"}</dd>
              </div>
            </dl>
          ) : (
            <>
              <section className="process-flow-selection-inspector__summary" aria-labelledby="process-flow-selected-items-title">
                <div>
                  <p>Current state</p>
                  <strong>{syncedCount} current{failedCount ? ` · ${failedCount} failed` : ""}</strong>
                </div>
                <div className="process-flow-selection-inspector__status-list">
                  {statusCounts.map(([label, count]) => <span key={label}>{label}: {count}</span>)}
                </div>
              </section>
              <section className="process-flow-selection-inspector__selection-list">
                <h3 id="process-flow-selected-items-title">Selected items</h3>
                <div>
                  {items.map((item) => (
                    <button key={item.assignmentId} onClick={() => onRemove(item.assignmentId)} type="button">
                      {item.label}<X aria-hidden size={12} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="process-flow-selection-inspector__readiness">
                <div><span>Move</span><strong>{moveTargets.length ? `${items.length} of ${items.length}` : "Unavailable"}</strong></div>
                <div><span>Submit review</span><strong>{submitEligibleCount} of {items.length}</strong></div>
              </section>
            </>
          )}

          {isSingle && activeItem.latestNote ? (
            <section className="process-flow-selection-inspector__evidence">
              <p>Latest checkpoint note</p>
              <blockquote>{activeItem.latestNote}</blockquote>
            </section>
          ) : null}

          {isSingle ? (
            <SelectionParameterPanel
              key={`${activeItem.assignmentId}:${activeItem.stepExecutionId ?? "unrecorded"}`}
              item={activeItem}
              canEdit={canEdit}
              onDirtyChange={onParameterDirtyChange}
            />
          ) : null}
        </div>

        <footer className="process-flow-selection-inspector__footer">
          <label>
            <span className="sr-only">Move selected items</span>
            <MoveRight aria-hidden size={15} />
            <select
              aria-label="Move selected items"
              defaultValue=""
              disabled={isPending || moveTargets.length === 0}
              onChange={(event) => {
                const targetId = event.currentTarget.value;
                event.currentTarget.value = "";
                if (targetId) onMove(targetId);
              }}
            >
              <option value="">Move to…</option>
              {moveTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </label>
          {submitEligibleCount === items.length ? (
            <button className="button primary-button" disabled={isPending} onClick={onSubmitCheckpoint} type="button">
              Submit review
            </button>
          ) : null}
          {isSingle && canUndoMovement ? (
            <button className="button ghost-button" disabled={isPending} onClick={onUndoMovement} type="button">
              <RotateCcw aria-hidden size={14} /> Undo movement
            </button>
          ) : null}
          {canDelete && deleteLabel ? (
            <button
              className="button button-danger ghost-button col-span-full justify-center"
              disabled={isPending}
              onClick={onDelete}
              type="button"
            >
              <Trash2 aria-hidden size={14} /> {deleteLabel}
            </button>
          ) : null}
          {isSingle ? (
            <button className="process-flow-selection-inspector__full-record" onClick={onOpenFullRecord} type="button">
              Open full record <ArrowUpRight aria-hidden size={14} />
            </button>
          ) : (
            <button className="process-flow-selection-inspector__clear" onClick={onClear} type="button">
              <Layers3 aria-hidden size={14} /> Clear selection
            </button>
          )}
        </footer>
      </section>
    </aside>
  );
}
