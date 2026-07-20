"use client";

import { AlertCircle, Check, LoaderCircle, Upload } from "lucide-react";
import type { ProcessFlowMutationQueueItem } from "./useProcessFlowMutationQueue";

function getStatusCopy(item: ProcessFlowMutationQueueItem) {
  if (item.detail) return item.detail;
  switch (item.state) {
    case "saving_move": return `Moving ${item.label}…`;
    case "awaiting_parameters": return `${item.label} moved · parameters needed`;
    case "saving_parameters": return `Saving parameters for ${item.label}…`;
    case "uploading_files": return `${item.label} saved · uploading files`;
    case "synced": return `${item.label} synced`;
    case "failed": return `${item.label} could not be saved`;
  }
}

export function ProcessFlowMutationStatus({
  items,
  onDismiss
}: {
  items: readonly ProcessFlowMutationQueueItem[];
  onDismiss: (assignmentId: string) => void;
}) {
  if (!items.length) return null;

  return (
    <div className="process-flow-sync-stack" aria-label="Process Flow sync status" aria-live="polite" data-testid="process-flow-sync-stack">
      {items.map((item) => {
        const Icon = item.state === "failed"
          ? AlertCircle
          : item.state === "synced"
            ? Check
            : item.state === "uploading_files"
              ? Upload
              : LoaderCircle;
        return (
          <div
            className={`process-flow-sync-message process-flow-sync-message--${item.state}`}
            data-sync-state={item.state}
            data-testid={`process-flow-sync-${item.assignmentId}`}
            key={item.assignmentId}
            role={item.state === "failed" ? "alert" : "status"}
          >
            <Icon aria-hidden className="process-flow-sync-message__icon" />
            <span>{getStatusCopy(item)}</span>
            {item.state === "failed" && item.retry ? (
              <button type="button" onClick={item.retry}>Retry</button>
            ) : null}
            {item.state === "failed" ? (
              <button type="button" onClick={() => onDismiss(item.assignmentId)}>Dismiss</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
