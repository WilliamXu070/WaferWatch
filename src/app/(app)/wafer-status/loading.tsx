export default function WaferStatusLoading() {
  return (
    <div
      className="wafer-status-detail-page grid gap-5 bg-white p-4 md:p-6"
      aria-label="Opening wafer or die status"
      aria-live="polite"
    >
      <div className="grid gap-3 border-b border-[#e7e7e2] pb-5">
        <div className="h-4 w-20 animate-pulse rounded bg-[#ecece7]" />
        <div className="h-9 w-40 animate-pulse rounded bg-[#e8e9e5]" />
        <div className="h-4 w-56 animate-pulse rounded bg-[#f0f0ec]" />
      </div>
      <div className="flex gap-3 border-b border-[#e7e7e2] pb-3">
        <div className="h-9 w-24 animate-pulse rounded bg-[#ecece7]" />
        <div className="h-9 w-32 animate-pulse rounded bg-[#f2f2ee]" />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-72 animate-pulse rounded-xl bg-[#f5f5f1]" />
        <div className="h-72 animate-pulse rounded-xl bg-[#f7f7f4]" />
      </div>
    </div>
  );
}
