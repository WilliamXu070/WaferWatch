export const processDashboardStyles = {
  shell: "mx-auto flex w-full max-w-shell flex-col gap-5 px-4 py-6 md:px-6 md:py-10",
  tabBar:
    "flex flex-wrap items-center gap-2 rounded-2xl border border-ww-border bg-white p-2 shadow-[0_16px_40px_-30px_rgba(20,20,20,0.5)]",
  tab:
    "inline-flex min-h-10 items-center justify-center rounded-full border border-transparent px-4 text-sm font-medium text-ww-muted transition hover:bg-zinc-100 hover:text-ww-ink active:scale-[0.98]",
  tabActive: "border-zinc-900 bg-zinc-900 text-white",
  panel: "rounded-2xl border border-ww-border bg-white p-5 shadow-[0_16px_40px_-30px_rgba(20,20,20,0.5)]",
  panelTitle: "text-xl font-semibold tracking-tight text-ww-ink",
  panelMeta: "text-sm text-ww-muted"
} as const;
