import type { ToolbarAction } from "../types";

type CrmDashboardToolbarProps = {
  heading: string;
  eyebrow: string;
  searchAction: ToolbarAction;
  sortAction: ToolbarAction;
  filterAction: ToolbarAction;
  searchPlaceholder: string;
};

export function CrmDashboardToolbar({
  heading,
  eyebrow,
  searchAction,
  sortAction,
  filterAction,
  searchPlaceholder,
}: CrmDashboardToolbarProps): React.JSX.Element {
  return (
    <header className="flex min-h-[68px] items-center justify-between gap-4 rounded-[14px] border border-ww-border bg-white p-3">
      <div>
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#585858]">
          {eyebrow}
        </p>
        <h1 className="m-0 text-[36px] leading-none font-bold tracking-tight text-ww-ink">
          {heading}
        </h1>
      </div>

      <nav
        aria-label="Dashboard tools"
        className="flex items-center gap-2.5"
      >
        <label
          htmlFor="dashboard-search"
          className="sr-only"
        >
          Search
        </label>
        <input
          id="dashboard-search"
          aria-label={searchAction.controlLabel}
          className="h-[38px] w-[260px] rounded-lg border border-ww-border bg-white px-3 text-sm text-ww-ink"
          defaultValue=""
          placeholder={searchPlaceholder}
          type="text"
        />
        <button
          aria-label={sortAction.label}
          className="h-[38px] min-w-[74px] rounded-lg border border-ww-border bg-[#f4f4f2] px-3 text-sm font-semibold text-ww-ink transition hover:bg-[#ececec]"
          type="button"
        >
          {sortAction.label}
        </button>
        <button
          aria-label={filterAction.label}
          className="h-[38px] min-w-[74px] rounded-lg border border-ww-border bg-[#f4f4f2] px-3 text-sm font-semibold text-ww-ink transition hover:bg-[#ececec]"
          type="button"
        >
          {filterAction.label}
        </button>
      </nav>
    </header>
  );
}
