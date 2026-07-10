"use client";

import { ArrowUpRight, UserRound } from "lucide-react";
import Link from "next/link";
import { WaferGeometryPreview } from "@/ui/waferwatch-wireframe/components/WaferGeometryPreview";

export type WaferDiePreviewModel = {
  processId: string;
  waferId: string;
  waferCode: string;
  dieLabel?: string | null;
  stepLabel?: string | null;
  handlerName?: string | null;
};

function getDisplayLabel(preview: WaferDiePreviewModel) {
  return preview.dieLabel?.trim() || preview.waferCode;
}

export function WaferDiePreview({ preview }: { preview: WaferDiePreviewModel | null }) {
  if (!preview) {
    return null;
  }

  const displayLabel = getDisplayLabel(preview);
  const isDie = Boolean(preview.dieLabel?.trim());
  const search = new URLSearchParams({ processId: preview.processId, waferId: preview.waferId });
  if (preview.dieLabel?.trim()) {
    search.set("dieLabel", preview.dieLabel.trim());
  }

  return (
    <aside className="pointer-events-none fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[360px]">
      <Link
        aria-label={`Open status for ${isDie ? "die" : "wafer"} ${displayLabel}`}
        className="pointer-events-auto block overflow-hidden rounded-lg border border-[#deded8] bg-[#fefefd] text-left shadow-[0_14px_36px_rgba(22,22,18,0.16)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#b8b8af] hover:shadow-[0_18px_42px_rgba(22,22,18,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
        href={`/wafer-status?${search.toString()}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#eeeeea] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">
              {isDie ? "Selected die" : "Selected wafer"}
            </p>
            <div className="mt-1 flex min-w-0 items-baseline gap-2">
              <h2 className="truncate text-[20px] font-semibold leading-none text-[#111111]">{displayLabel}</h2>
              <span className="truncate text-xs text-[#77776f]">{preview.waferCode}</span>
            </div>
          </div>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-[#55554f]" aria-hidden="true" />
        </header>

        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 px-4 py-3.5">
          <div className="grid aspect-square place-items-center border border-[#eeeeea] bg-[#fafaf8] p-2">
            <WaferGeometryPreview
              modeKeyword={isDie ? "post-dice" : "pre-dice"}
              selectedDieCode={isDie ? preview.dieLabel ?? undefined : undefined}
              colorSeed={preview.waferCode}
              showDieLabel={false}
              showOnlySelectedDie={isDie}
              className="max-h-[68px]"
            />
          </div>
          <dl className="grid min-w-0 gap-3 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">Current step</dt>
              <dd className="mt-0.5 truncate font-semibold text-[#111111]">{preview.stepLabel?.trim() || "Not started"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-[#8a887b]" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">Handling</dt>
                <dd className="mt-0.5 truncate font-semibold text-[#111111]">{preview.handlerName?.trim() || "Unassigned"}</dd>
              </div>
            </div>
          </dl>
        </div>
      </Link>
    </aside>
  );
}
