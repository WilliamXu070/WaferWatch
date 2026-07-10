export type WaferCreateDraft = {
  waferCode: string;
  diameterMm: number;
};

const WAFER_SIZE_OPTIONS = [50, 75, 100, 150, 200] as const;

export function WaferCreateDialog({
  draft,
  isPending,
  onCancel,
  onChange,
  onSubmit
}: {
  draft: WaferCreateDraft;
  isPending: boolean;
  onCancel: () => void;
  onChange: (draft: WaferCreateDraft) => void;
  onSubmit: () => void;
}) {
  return (
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
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            disabled={isPending}
            maxLength={80}
            onChange={(event) => onChange({ ...draft, waferCode: event.currentTarget.value })}
            value={draft.waferCode}
          />
        </label>
        <label className="field">
          <span>Size</span>
          <select
            disabled={isPending}
            onChange={(event) => onChange({ ...draft, diameterMm: Number(event.currentTarget.value) })}
            value={draft.diameterMm}
          >
            {WAFER_SIZE_OPTIONS.map((diameter) => (
              <option key={diameter} value={diameter}>{diameter} mm</option>
            ))}
          </select>
        </label>
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
            disabled={isPending || !draft.waferCode.trim()}
            type="submit"
          >
            {isPending ? "Creating..." : "Create wafer"}
          </button>
        </div>
      </form>
    </div>
  );
}
