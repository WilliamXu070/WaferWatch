import {
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UserIcon
} from "../icons";

export function WireframeTopbar() {
  return (
    <header className="flex items-center gap-3 border-b border-ww-border bg-ww-panel px-6 py-4">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8a83]">
          <SearchIcon />
        </span>
        <input
          type="text"
          readOnly
          placeholder="Search wafers, steps, die notes..."
          aria-label="Search"
          style={{ caretColor: "transparent" }}
          className="h-11 w-full rounded-xl border border-ww-border bg-[#fafaf7] pl-11 pr-16 text-sm text-ww-ink placeholder:text-[#9a9a92] focus:outline-none focus:ring-2 focus:ring-[#c9c9c1]"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-ww-border bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#7a7a72]">
          ⌘ K
        </kbd>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded-xl border border-ww-border bg-white px-3.5 text-sm font-medium text-[#48453f] transition-colors hover:bg-[#f4f4ef]"
        >
          <SortIcon />
          Sort by
        </button>
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded-xl border border-ww-border bg-white px-3.5 text-sm font-medium text-[#48453f] transition-colors hover:bg-[#f4f4ef]"
        >
          <FilterIcon />
          Filters
        </button>
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded-xl border border-ww-border bg-white px-3.5 text-sm font-medium text-[#48453f] transition-colors hover:bg-[#f4f4ef]"
        >
          <UserIcon />
          Me
        </button>
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded-xl bg-ww-ink px-4 text-sm font-semibold text-white transition-transform hover:-translate-y-px"
        >
          <PlusIcon />
          Add wafer
        </button>
      </div>
    </header>
  );
}
