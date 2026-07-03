export const waferVisualizerStyles = {
  shell: "mx-auto flex w-full max-w-shell flex-col gap-5 px-4 py-6 md:px-6 md:py-10",
  workspace:
    "rounded-2xl border border-ww-border bg-white p-4 shadow-[0_16px_40px_-30px_rgba(20,20,20,0.5)] md:p-6",
  workspaceHeader: "space-y-2",
  workspaceTitle: "text-2xl font-semibold tracking-tight text-ww-ink",
  workspaceMeta: "text-sm text-ww-muted",
  toolbar: "flex flex-wrap items-center gap-2",
  actionButton:
    "inline-flex min-h-10 items-center justify-center rounded-xl border border-ww-border bg-white px-3 text-sm font-medium text-ww-ink transition hover:bg-zinc-100 active:scale-[0.98]"
} as const;
