export const authPageStyles = {
  shell: "min-h-[100dvh] bg-ww-bg px-4 py-8 md:px-6 md:py-10",
  shellInner: "mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-shell items-center justify-center",
  card: "w-full max-w-xl rounded-panel border border-ww-border bg-ww-panel p-7 shadow-panel md:p-10",
  hero: "space-y-2 text-left",
  eyebrow:
    "text-[11px] font-semibold uppercase tracking-[0.16em] text-ww-muted",
  title:
    "text-4xl font-semibold tracking-tight text-ww-ink md:text-5xl md:leading-none",
  supportingCopy: "mt-4 text-sm leading-6 text-ww-muted",
  notice: "rounded-xl border px-3 py-2 text-sm leading-relaxed",
  noticeError: "border-red-300 bg-red-50 text-red-700",
  noticeMessage: "border-emerald-300 bg-emerald-50 text-emerald-700"
} as const;

export const authFormStyles = {
  panel: "mt-6 space-y-5",
  modeSwitch: "grid grid-cols-2 gap-2 rounded-xl border border-ww-border bg-white p-1",
  modeButtonBase:
    "inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition active:scale-[0.98]",
  modeButtonInactive: "text-ww-muted hover:bg-zinc-100 hover:text-ww-ink",
  modeButtonActive: "border border-zinc-900 bg-zinc-900 text-white",
  form: "space-y-4",
  field: "grid gap-2",
  label: "text-sm font-medium text-ww-ink",
  passwordLabelRow: "flex items-center justify-between gap-3",
  input:
    "h-11 rounded-xl border border-ww-border bg-white px-3 text-sm text-ww-ink outline-none transition focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700/15",
  formError: "rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700",
  formMessage:
    "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700",
  resendForm: "space-y-4 border-t border-ww-border pt-5",
  resendTitle: "text-sm font-semibold text-ww-ink",
  resendCopy: "mt-1 text-sm text-ww-muted",
  recoveryTitle: "text-lg font-semibold text-ww-ink",
  recoveryCopy: "mt-1 text-sm leading-6 text-ww-muted",
  resetForm: "mt-6 space-y-4",
  textButton: "text-sm font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950",
  submit:
    "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-900 bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
} as const;
