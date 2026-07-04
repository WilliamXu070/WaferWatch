"use client";

type ProcessFlowToolbarProps = {
  nodesCount: number;
  zoomPercent: number;
  isGraphPending: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onCenterView: () => void;
  onOrganize: () => void;
};

export function ProcessFlowToolbar({
  nodesCount,
  zoomPercent,
  isGraphPending,
  onZoomOut,
  onZoomIn,
  onCenterView,
  onOrganize
}: ProcessFlowToolbarProps) {
  return (
    <div className="flow-map-toolbar" aria-label="Flow map controls">
      <div className="flow-map-actions" role="group" aria-label="Canvas controls">
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
        <button
          className="button button-secondary flow-fit-button flow-auto-layout-button"
          type="button"
          onClick={onOrganize}
          disabled={nodesCount < 2 || isGraphPending}
        >
          Organize
        </button>
      </div>
    </div>
  );
}
