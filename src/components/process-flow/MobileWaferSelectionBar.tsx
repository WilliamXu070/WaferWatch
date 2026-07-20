type MobileWaferSelectionBarProps = {
  label: string;
  moveTargets: readonly { id: string; label: string }[];
  canSubmitCheckpoint: boolean;
  canDelete: boolean;
  deleteLabel: string;
  isPending: boolean;
  onClear: () => void;
  onDelete: () => void;
  onMove: (targetId: string) => void;
  onSubmitCheckpoint: () => void;
};

/**
 * Phone selection exposes native tap controls while preserving drag as a fast
 * canvas gesture. The parent still applies the authoritative movement checks.
 */
export function MobileWaferSelectionBar({
  label,
  moveTargets,
  canSubmitCheckpoint,
  canDelete,
  deleteLabel,
  isPending,
  onClear,
  onDelete,
  onMove,
  onSubmitCheckpoint
}: MobileWaferSelectionBarProps) {
  return (
    <div
      aria-label={`Selection actions for ${label}`}
      className="mx-3 mb-2 grid gap-2 rounded-xl border border-[#e5e5db] bg-[#fafaf4] p-3 md:hidden"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6a5f]">
            {label}
          </p>
          <p className="text-[11px] font-medium text-[#8a887b]">Tap an action or drag on the map</p>
        </div>
        <button
          className="button ghost-button min-h-11 shrink-0"
          disabled={isPending}
          onClick={onClear}
          type="button"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="relative min-w-0">
          <span className="sr-only">Move selected wafer or die</span>
          <select
            aria-label="Move selected wafer or die"
            className="h-11 w-full min-w-0 rounded-lg border border-[#d7d7cf] bg-white px-3 text-[16px] font-semibold text-[#3f3f3a] outline-none focus:border-[#171714] disabled:opacity-50"
            defaultValue=""
            disabled={isPending || moveTargets.length === 0}
            onChange={(event) => {
              const targetId = event.currentTarget.value;
              event.currentTarget.value = "";
              if (targetId) onMove(targetId);
            }}
          >
            <option value="">Move to…</option>
            {moveTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </select>
        </label>
        {canSubmitCheckpoint ? (
          <button
            className="button primary-button min-h-11"
            disabled={isPending}
            onClick={onSubmitCheckpoint}
            type="button"
          >
            Submit review
          </button>
        ) : canDelete ? (
          <button
            className="button button-secondary min-h-11"
            disabled={isPending}
            onClick={onDelete}
            type="button"
          >
            {deleteLabel}
          </button>
        ) : <span aria-hidden />}
      </div>
      {canSubmitCheckpoint && canDelete ? (
        <button
          className="min-h-11 justify-self-start px-1 text-[12px] font-semibold text-[#8a3c35]"
          disabled={isPending}
          onClick={onDelete}
          type="button"
        >
          {deleteLabel}
        </button>
      ) : null}
    </div>
  );
}
