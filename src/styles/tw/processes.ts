export const processesStyles = {
  shell: "mx-auto flex w-full max-w-shell flex-col gap-5 px-4 py-6 md:px-6 md:py-10",
  heading: "flex w-full flex-col gap-4 md:flex-row md:items-start md:justify-between",
  headingBody: "space-y-2",
  eyebrow:
    "text-[11px] font-semibold uppercase tracking-[0.16em] text-ww-muted",
  title: "text-4xl font-semibold tracking-tight text-ww-ink md:text-5xl",
  headingActions: "flex flex-wrap items-center gap-2",
  secondaryButton:
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-ww-border bg-white px-4 text-sm font-medium text-ww-ink transition hover:border-zinc-400 hover:bg-zinc-100 active:scale-[0.98]",
  bodyCopy: "max-w-[70ch] text-base leading-relaxed text-ww-muted",
  stats: "text-sm font-medium text-ww-muted",
  grid: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3",
  card:
    "grid gap-3 rounded-2xl border border-ww-border bg-white p-5 shadow-[0_16px_40px_-28px_rgba(20,20,20,0.5)] transition hover:-translate-y-[1px] hover:border-zinc-400",
  cardHeader: "flex items-baseline justify-between gap-3",
  cardTitle: "text-[1.375rem] font-semibold leading-tight tracking-tight text-ww-ink",
  cardMeta: "text-sm leading-relaxed text-ww-muted",
  statusBase:
    "inline-flex min-h-6 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
  statusActive: "border border-emerald-300 bg-emerald-100 text-emerald-800",
  statusInactive: "border border-zinc-300 bg-zinc-100 text-zinc-700"
} as const;
