"use client";

import { ArrowUpRight, GripHorizontal, RotateCcw, Scaling, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { WaferGeometryPreview } from "@/ui/waferwatch-wireframe/components/WaferGeometryPreview";

const PANEL_MARGIN = 12;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 480;

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

type PanelResize = {
  pointerId: number;
  right: number;
  startClientX: number;
  startWidth: number;
  top: number;
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
  return preview.dieLabel?.trim() || preview.waferCode;
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
  const resizeRef = useRef<PanelResize | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const keepPanelInViewport = () => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      setPanelWidth((current) =>
        current
          ? Math.min(current, Math.max(MIN_PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2))
          : current
      );
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

  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    resizeRef.current = {
      pointerId: event.pointerId,
      right: rect.right,
      startClientX: event.clientX,
      startWidth: rect.width,
      top: rect.top
    };
    setPosition({ left: rect.left, top: rect.top });
    setPanelWidth(rect.width);
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const resizePanel = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    const maxWidth = Math.min(MAX_PANEL_WIDTH, resize.right - PANEL_MARGIN);
    const nextWidth = Math.max(
      Math.min(MIN_PANEL_WIDTH, maxWidth),
      Math.min(resize.startWidth + resize.startClientX - event.clientX, maxWidth)
    );
    setPanelWidth(nextWidth);
    setPosition({ left: resize.right - nextWidth, top: resize.top });
  };

  const finishResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
    setIsResizing(false);
  };

  const resetPanel = () => {
    dragRef.current = null;
    resizeRef.current = null;
    setIsDragging(false);
    setIsResizing(false);
    setPanelWidth(null);
    setPosition(null);
  };

  const panelStyle: CSSProperties | undefined = position || panelWidth
    ? {
        ...(position ? { left: position.left, top: position.top } : {}),
        ...(panelWidth ? { width: panelWidth } : {})
      }
    : undefined;

  return (
    <aside
      ref={panelRef}
      className={[
        "pointer-events-none fixed z-40 w-[calc(100vw-1.5rem)] sm:w-[360px]",
        position ? "" : "inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-5 sm:right-5"
      ].join(" ")}
      style={panelStyle}
    >
      <div className="pointer-events-auto relative overflow-hidden rounded-lg border border-[#deded8] bg-[#fefefd] text-left shadow-[0_14px_36px_rgba(22,22,18,0.16)]">
        <div className="flex border-b border-[#eeeeea]">
          <button
            type="button"
            aria-label="Move selected wafer information panel"
            className={[
              "flex min-w-0 flex-1 touch-none items-start justify-between gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-[#f8f8f5] focus-visible:bg-[#f3f3ef] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]",
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">
                {isDie ? "Selected die" : "Selected wafer"}
              </p>
              <div className="mt-1 flex min-w-0 items-baseline gap-2">
                <h2 className="truncate text-[20px] font-semibold leading-none text-[#111111]">{displayLabel}</h2>
                <span className="truncate text-xs text-[#77776f]">{preview.waferCode}</span>
              </div>
            </div>
            <GripHorizontal className="mt-1 size-5 shrink-0 text-[#77776f]" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Reset panel to bottom right"
            className="grid w-11 shrink-0 place-items-center border-l border-[#eeeeea] text-[#77776f] outline-none transition-colors duration-150 hover:bg-[#f3f3ef] hover:text-[#22221f] focus-visible:bg-[#f3f3ef] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]"
            title="Reset position and size"
            onClick={resetPanel}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        </div>

        <Link
          aria-label={`Open status for ${isDie ? "die" : "wafer"} ${displayLabel}`}
          className="group grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 px-4 py-3.5 outline-none transition-colors duration-150 hover:bg-[#fafaf8] focus-visible:bg-[#f5f5f1] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]"
          href={`/wafer-status?${search.toString()}`}
        >
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
          <div className="grid min-w-0 gap-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">Current step</p>
              <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 font-semibold text-[#111111]">
                <span className="truncate">{preview.stepLabel?.trim() || "Not started"}</span>
                <ArrowUpRight className="size-4 shrink-0 text-[#77776f] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </div>
            </div>
            <div className="border-t border-[#eeeeea] pt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a887b]">Handler</p>
              <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#efefeb] text-[#55554f]">
                  <UserRound className="size-3.5" aria-hidden="true" />
                </span>
                <p className="min-w-0 truncate font-semibold text-[#111111]">
                  {preview.handlerName?.trim() || "Unassigned"}
                </p>
              </div>
            </div>
          </div>
        </Link>
        <button
          type="button"
          aria-label="Resize selected wafer information panel"
          className={[
            "absolute bottom-0 left-0 z-10 grid size-8 touch-none place-items-center text-[#8a887b] outline-none transition-colors duration-150 hover:bg-[#eeeeea] hover:text-[#22221f] focus-visible:bg-[#eeeeea] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]",
            isResizing ? "cursor-nesw-resize bg-[#eeeeea] text-[#22221f]" : "cursor-nesw-resize"
          ].join(" ")}
          title="Resize panel"
          onPointerCancel={finishResize}
          onPointerDown={beginResize}
          onPointerMove={resizePanel}
          onPointerUp={finishResize}
        >
          <Scaling className="size-3.5 -rotate-90" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
