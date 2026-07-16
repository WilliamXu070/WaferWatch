"use client";

import { ArrowUpRight, GripHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDieDisplayLabel } from "@/features/wafers/dieDisplayLabel";
import { WaferGeometryPreview } from "@/ui/waferwatch-wireframe/components/WaferGeometryPreview";

const PANEL_MARGIN = 12;

type PanelPosition = {
  left: number;
  top: number;
};

type PanelDrag = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export type WaferDiePreviewModel = {
  processId: string;
  waferId: string;
  waferCode: string;
  dieLabel?: string | null;
  stepLabel?: string | null;
  handlerName?: string | null;
};

function getDisplayLabel(preview: WaferDiePreviewModel) {
  return preview.dieLabel?.trim()
    ? formatDieDisplayLabel(preview.dieLabel)
    : preview.waferCode;
}

function clampPanelPosition(left: number, top: number, width: number, height: number): PanelPosition {
  return {
    left: Math.max(PANEL_MARGIN, Math.min(left, window.innerWidth - width - PANEL_MARGIN)),
    top: Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - height - PANEL_MARGIN))
  };
}

export function WaferDiePreview({ preview }: { preview: WaferDiePreviewModel | null }) {
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<PanelDrag | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const keepPanelInViewport = () => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      setPosition((current) =>
        current ? clampPanelPosition(current.left, current.top, rect.width, rect.height) : current
      );
    };

    window.addEventListener("resize", keepPanelInViewport);
    return () => window.removeEventListener("resize", keepPanelInViewport);
  }, []);

  if (!preview) {
    return null;
  }

  const displayLabel = getDisplayLabel(preview);
  const secondaryLabel = preview.waferCode === preview.dieLabel
    ? null
    : preview.waferCode;
  const isDie = Boolean(preview.dieLabel?.trim());
  const search = new URLSearchParams({ processId: preview.processId, waferId: preview.waferId });
  if (preview.dieLabel?.trim()) {
    search.set("dieLabel", preview.dieLabel.trim());
  }

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    setPosition({ left: rect.left, top: rect.top });
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePanel = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setPosition(
      clampPanelPosition(
        event.clientX - drag.offsetX,
        event.clientY - drag.offsetY,
        drag.width,
        drag.height
      )
    );
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  const movePanelWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const deltaByKey: Record<string, PanelPosition> = {
      ArrowLeft: { left: -12, top: 0 },
      ArrowRight: { left: 12, top: 0 },
      ArrowUp: { left: 0, top: -12 },
      ArrowDown: { left: 0, top: 12 }
    };
    const delta = deltaByKey[event.key];
    const panel = panelRef.current;
    if (!delta || !panel) {
      return;
    }

    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    setPosition(
      clampPanelPosition(
        rect.left + delta.left,
        rect.top + delta.top,
        rect.width,
        rect.height
      )
    );
  };

  return (
    <aside
      ref={panelRef}
      className={[
        "wafer-die-preview-panel pointer-events-none fixed z-40 w-[224px] max-w-[calc(100vw-1.5rem)] sm:w-[clamp(300px,30vw,380px)]",
        position ? "" : "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 sm:bottom-5 sm:right-5"
      ].join(" ")}
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-[#deded8] bg-[#fefefd] text-left shadow-[0_14px_36px_rgba(22,22,18,0.16)]">
        <button
          type="button"
          aria-label="Move selected wafer information panel"
          className={[
            "flex w-full touch-none items-start justify-between gap-2 border-b border-[#eeeeea] px-2.5 py-2 text-left outline-none transition-colors duration-150 hover:bg-[#f8f8f5] focus-visible:bg-[#f3f3ef] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111] sm:gap-3 sm:px-4 sm:py-3",
            isDragging ? "cursor-grabbing bg-[#f3f3ef]" : "cursor-grab"
          ].join(" ")}
          title="Move panel"
          onKeyDown={movePanelWithKeyboard}
          onPointerCancel={finishDrag}
          onPointerDown={beginDrag}
          onPointerMove={movePanel}
          onPointerUp={finishDrag}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8a887b] sm:text-[11px]">
              {isDie ? "Selected die" : "Selected wafer"}
            </p>
            <div className="mt-0.5 flex min-w-0 items-baseline gap-2 sm:mt-1">
              <h2 className="truncate text-[15px] font-semibold leading-none text-[#111111] sm:text-[20px]">{displayLabel}</h2>
              {secondaryLabel ? (
                <span className="hidden truncate text-xs text-[#77776f] sm:inline">{secondaryLabel}</span>
              ) : null}
            </div>
          </div>
          <GripHorizontal className="mt-0.5 size-4 shrink-0 text-[#77776f] sm:mt-1 sm:size-5" aria-hidden="true" />
        </button>

        <Link
          aria-label={`Open status for ${isDie ? "die" : "wafer"} ${displayLabel}`}
          className="group grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2.5 px-2.5 py-2.5 outline-none transition-colors duration-150 hover:bg-[#fafaf8] focus-visible:bg-[#f5f5f1] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111] sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4 sm:px-4 sm:py-3.5"
          href={`/wafer-status?${search.toString()}`}
        >
          <div className="grid aspect-square place-items-center border border-[#eeeeea] bg-[#fafaf8] p-2">
            <WaferGeometryPreview
              modeKeyword={isDie ? "post-dice" : "pre-dice"}
              selectedDieCode={isDie ? preview.dieLabel ?? undefined : undefined}
              colorSeed={preview.waferCode}
              showDieLabel={false}
              showOnlySelectedDie={isDie}
              className="max-h-[46px] sm:max-h-[68px]"
            />
          </div>
          <div className="grid min-w-0 gap-2 text-xs sm:gap-3 sm:text-sm">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8a887b] sm:text-[11px]">Current step</p>
              <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 font-semibold text-[#111111]">
                <span className="truncate">{preview.stepLabel?.trim() || "Not started"}</span>
                <ArrowUpRight className="size-4 shrink-0 text-[#77776f] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </div>
            </div>
            <div className="border-t border-[#eeeeea] pt-2 sm:pt-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8a887b] sm:text-[11px]">Handler</p>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 sm:mt-1.5 sm:gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#efefeb] text-[#55554f] sm:size-7">
                  <UserRound className="size-3 sm:size-3.5" aria-hidden="true" />
                </span>
                <p className="min-w-0 truncate font-semibold text-[#111111]">
                  {preview.handlerName?.trim() || "Unassigned"}
                </p>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
