export default function AppRouteLoading() {
  return (
    <div className="flex min-h-full items-start p-4 md:p-6" aria-live="polite" aria-label="Loading workspace">
      <div className="w-full rounded-2xl border border-[#e8e8e1] bg-white p-5 md:p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-[#f0f1f3]" />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="h-24 animate-pulse rounded-xl bg-[#f6f7f8]" />
          <div className="h-24 animate-pulse rounded-xl bg-[#f6f7f8]" />
          <div className="h-24 animate-pulse rounded-xl bg-[#f6f7f8]" />
        </div>
      </div>
    </div>
  );
}
