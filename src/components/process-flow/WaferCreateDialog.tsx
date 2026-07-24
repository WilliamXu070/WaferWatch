import { WaferWatchPortal } from "@/ui/waferwatch-wireframe/components/WaferWatchPortal";

export type WaferCreateDraft = {
  waferCode: string;
  dieCount: number;
};

export function WaferCreateDialog({
  draft,
  errorMessage,
  isPending,
  onCancel,
  onChange,
  onSubmit
}: {
  draft: WaferCreateDraft;
  errorMessage?: string | null;
  isPending: boolean;
  onCancel: () => void;
  onChange: (draft: WaferCreateDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <WaferWatchPortal>
      <div className="flow-wafer-move-dialog-backdrop !z-[200]">
        <form
          aria-labelledby="flow-wafer-create-title"
          aria-modal="true"
          className="flow-wafer-move-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          role="dialog"
        >
          <div className="flow-wafer-move-dialog__header">
            <p className="eyebrow">New wafer</p>
            <h2 id="flow-wafer-create-title">Create wafer</h2>
          </div>
          <label className="field" htmlFor="flow-wafer-create-name">
            <span>Name</span>
            <input
              aria-describedby={errorMessage ? "flow-wafer-create-error" : undefined}
              aria-invalid={Boolean(errorMessage)}
              autoFocus
              autoComplete="off"
              disabled={isPending}
              id="flow-wafer-create-name"
              maxLength={80}
              name="waferCode"
              onChange={(event) => onChange({ ...draft, waferCode: event.currentTarget.value })}
              value={draft.waferCode}
            />
          </label>
          <label className="field" htmlFor="flow-wafer-create-die-count">
            <span>Number of dies</span>
            <input
              disabled={isPending}
              id="flow-wafer-create-die-count"
              inputMode="numeric"
              max={256}
              min={1}
              name="dieCount"
              onChange={(event) => onChange({ ...draft, dieCount: Number(event.currentTarget.value) })}
              required
              type="number"
              value={draft.dieCount}
            />
            <small>
              Creates {draft.dieCount || 0} dies labeled {draft.waferCode.trim() || "WAFER"}_1 through {draft.waferCode.trim() || "WAFER"}_{draft.dieCount || 0}.
            </small>
          </label>
          {errorMessage ? (
            <p className="form-error" id="flow-wafer-create-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="flow-wafer-move-dialog__actions">
            <button
              className="button ghost-button"
              disabled={isPending}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button primary-button"
              disabled={isPending || !draft.waferCode.trim() || !Number.isInteger(draft.dieCount) || draft.dieCount < 1}
              type="submit"
            >
              {isPending ? "Creating..." : "Create wafer"}
            </button>
          </div>
        </form>
      </div>
    </WaferWatchPortal>
  );
}
