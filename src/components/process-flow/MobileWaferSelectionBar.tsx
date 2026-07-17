type MobileWaferSelectionBarProps = {
  label: string;
  canDelete: boolean;
  deleteLabel: string;
  isPending: boolean;
  onClear: () => void;
  onDelete: () => void;
};

/**
 * Phone selection stays intentionally small: dragging the selected die onto a
 * process lane is the movement and checkpoint-completion control.
 */
export function MobileWaferSelectionBar({
  label,
  canDelete,
  deleteLabel,
  isPending,
  onClear,
  onDelete
}: MobileWaferSelectionBarProps) {
  return (
    <div
      aria-label={`Selection actions for ${label}`}
      className="mx-3 mb-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5db] bg-[#fafaf4] px-3 py-2 md:hidden"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6a5f]">
          {label}
        </p>
        <p className="text-[11px] font-medium text-[#8a887b]">Drag to move</p>
      </div>
      <button
        className="button ghost-button shrink-0"
        disabled={isPending}
        onClick={onClear}
        type="button"
      >
        Clear
      </button>
      {canDelete ? (
        <button
          className="button button-secondary shrink-0"
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
