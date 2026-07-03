import type { DashboardStatus, SelectedWaferPanel } from "../types";

type CrmSelectedWaferPanelProps = {
  selectedWafer: SelectedWaferPanel;
  statusClassNameByState: Record<DashboardStatus, string>;
};

export function CrmSelectedWaferPanel({
  selectedWafer,
  statusClassNameByState,
}: CrmSelectedWaferPanelProps): React.JSX.Element {
  return (
    <aside
      className="rounded-[14px] border border-ww-border bg-white p-3"
      aria-label="Selected wafer panel"
    >
      <header className="grid gap-1">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6f6a]">
          Selected wafer
        </p>
        <h2 className="m-0 text-xl font-bold text-ww-ink">{selectedWafer.title}</h2>
      </header>

      <div className="mt-2 border-y border-[#e3e3dc] py-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6f6a]">
          Status
        </span>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClassNameByState[selectedWafer.status]}`}
          role="status"
          aria-live="polite"
        >
          {selectedWafer.status}
        </span>
      </div>

      <dl className="mt-3 grid gap-2">
        {selectedWafer.rows.map((row) => (
          <div
            key={`${selectedWafer.waferId}-${row.label}`}
            className="grid grid-cols-[72px_1fr] gap-2 text-sm"
          >
            <dt className="font-semibold text-[#6f6f6a]">{row.label}</dt>
            <dd className="m-0 text-ww-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] leading-snug text-[#5c5c58]">
        <span className="font-semibold">Next action</span> {selectedWafer.nextAction}
      </p>
    </aside>
  );
}
