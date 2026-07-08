"use client";

type ProcessFlowToolbarProps = {
  nodesCount: number;
  zoomPercent: number;
  isGraphPending: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onCenterView: () => void;
  onOrganize: () => void;
  onAddWafer?: () => void;
  onUndo: () => void;
  canUndo: boolean;
  canAddWafer: boolean;
  canEdit: boolean;
};

export function ProcessFlowToolbar({
  nodesCount,
  zoomPercent,
  isGraphPending,
  onZoomOut,
  onZoomIn,
  onCenterView,
  onOrganize,
  onAddWafer,
  onUndo,
  canUndo,
  canAddWafer,
  canEdit
}: ProcessFlowToolbarProps) {
  return (
    <div className="flow-map-toolbar" aria-label="Flow map controls">
      <div className="flow-map-actions" role="group" aria-label="Canvas controls">
        {canEdit ? (
          <button className="button button-secondary flow-fit-button" type="button" onClick={onUndo} disabled={!canUndo || isGraphPending}>
            Undo
          </button>
        ) : null}
        <button
          className="button button-secondary flow-icon-button"
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="flow-map-zoom">{zoomPercent}%</span>
        <button
          className="button button-secondary flow-icon-button"
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
        >
          +
        </button>
        <button className="button button-secondary flow-fit-button" type="button" onClick={onCenterView} disabled={nodesCount === 0}>
          Center view
        </button>
        {canEdit ? (
          <>
            <button
              className="button button-secondary flow-fit-button flow-auto-layout-button"
              type="button"
              onClick={onOrganize}
              disabled={nodesCount < 2 || isGraphPending}
            >
              Organize
            </button>
            <button
              className="button button-secondary flow-fit-button flow-add-wafer-button"
              type="button"
              onClick={onAddWafer}
              disabled={!canAddWafer || isGraphPending}
            >
              <span aria-hidden="true">+</span>
              Add wafer
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
