import {
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UserIcon
} from "../icons";

export function WireframeTopbar() {
  return (
    <header className="flex items-center gap-4 bg-[#f2f2e8] px-8 pb-2 pt-6">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a887b]">
          <SearchIcon />
        </span>
        <input
          type="text"
          readOnly
          placeholder="Search wafers, steps, die notes..."
          aria-label="Search"
          className="h-12 w-full rounded-2xl border border-[#e0dfd2] bg-white pl-11 pr-16 text-[15px] text-[#151512] placeholder:text-[#9c9a8c] focus:outline-none focus:ring-2 focus:ring-[#c9c8b9]"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[#e4e3d8] bg-[#faf9f3] px-1.5 py-0.5 text-[11px] font-medium text-[#8a887b]">
          ⌘ K
        </kbd>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-12 items-center overflow-hidden rounded-2xl border border-[#e0dfd2] bg-white">
          <button
            type="button"
            className="flex h-12 items-center gap-2 border-r border-[#ecebdf] px-4 text-sm font-medium text-[#4a483f] transition-colors hover:bg-[#f6f5ec]"
          >
            <SortIcon />
            Sort by
          </button>
          <button
            type="button"
            className="flex h-12 items-center gap-2 border-r border-[#ecebdf] px-4 text-sm font-medium text-[#4a483f] transition-colors hover:bg-[#f6f5ec]"
          >
            <FilterIcon />
            Filters
          </button>
          <button
            type="button"
            className="flex h-12 items-center gap-2 px-4 text-sm font-medium text-[#4a483f] transition-colors hover:bg-[#f6f5ec]"
          >
            <UserIcon />
            Me
          </button>
        </div>
        <button
          type="button"
          className="flex h-12 items-center gap-2 rounded-2xl bg-[#141412] px-5 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:bg-black active:translate-y-0"
        >
          <PlusIcon />
          Add wafer
        </button>
      </div>
    </header>
  );
}
