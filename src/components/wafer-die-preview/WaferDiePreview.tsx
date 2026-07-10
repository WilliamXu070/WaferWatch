"use client";

import { ExternalLink, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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

export function WaferDiePreview({
  preview,
  onClose
}: {
  preview: WaferDiePreviewModel | null;
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!preview) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, preview]);

  if (!preview) {
    return null;
  }

  const displayLabel = getDisplayLabel(preview);
  const isDie = Boolean(preview.dieLabel?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/25 p-3 sm:items-center sm:justify-center sm:p-6" onPointerDown={onClose}>
      <section
        aria-labelledby="wafer-die-preview-title"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-[#e5e5df] bg-white shadow-2xl sm:max-w-lg"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#eeeeea] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">
              {isDie ? "Selected die" : "Selected wafer"}
            </p>
            <h2 id="wafer-die-preview-title" className="mt-1 text-[24px] font-semibold leading-none text-[#111111]">
              {displayLabel}
            </h2>
            <p className="mt-2 text-sm text-[#6f6f68]">Wafer {preview.waferCode}</p>
          </div>
          <button
            type="button"
            aria-label="Close die preview"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-[#e5e5df] text-[#44443f] transition-colors hover:bg-[#f6f6f3]"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
          <div className="grid aspect-square place-items-center border border-[#eeeeea] bg-[#fbfbfa] p-3">
            <WaferGeometryPreview
              modeKeyword={isDie ? "post-dice" : "pre-dice"}
              selectedDieCode={isDie ? preview.dieLabel ?? undefined : undefined}
              colorSeed={preview.waferCode}
              showDieLabel={false}
              showOnlySelectedDie={isDie}
              className="max-h-28"
            />
          </div>
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">Current step</dt>
              <dd className="mt-1 font-semibold text-[#111111]">{preview.stepLabel?.trim() || "Not started"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-[#8a887b]" aria-hidden="true" />
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">Handling</dt>
                <dd className="mt-1 font-semibold text-[#111111]">{preview.handlerName?.trim() || "Unassigned"}</dd>
              </div>
            </div>
          </dl>
        </div>

        <footer className="flex justify-end border-t border-[#eeeeea] px-5 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a28]"
            onClick={() => {
              const search = new URLSearchParams({ processId: preview.processId, waferId: preview.waferId });
              if (preview.dieLabel?.trim()) {
                search.set("dieLabel", preview.dieLabel.trim());
              }
              router.push(`/wafer-status?${search.toString()}`);
            }}
          >
            Open status
            <ExternalLink className="size-4" aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  );
}
