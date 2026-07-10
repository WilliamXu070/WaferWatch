"use client";

import { useState } from "react";
import type { WaferStatusTileModel } from "../../types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon
} from "../../icons";
import { dieDetailTabs, type DieDetailTab } from "./waferDieDetailData";
import { WaferDieDetailTabs } from "./WaferDieDetailTabs";
import type { WaferDieNoteViewer } from "./WaferDieNotes";

export function DieDetailView({
  tile,
  canEdit,
  currentUser,
  onBack,
  onNavigate,
  canNavigateBack,
  canNavigateForward
}: {
  tile: WaferStatusTileModel;
  canEdit: boolean;
  currentUser?: WaferDieNoteViewer | null;
  onBack: () => void;
  onNavigate: (direction: -1 | 1) => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DieDetailTab>("overview");
  const displayLabel = tile.dieLabel || tile.code;

  return (
    <section className="wafer-die-detail-view grid gap-5 bg-white md:gap-6">
      <div className="wafer-die-detail-header border-b border-[#eeeeea] bg-white pb-4 md:pb-6">
        <div className="wafer-die-detail-breadcrumb mb-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#8a887b] md:mb-6">
          <button type="button" onClick={onBack} className="hover:text-[#111111]">Wafers</button>
          <ChevronRightIcon />
          <span className="text-[#111111]">Die {displayLabel}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold leading-none tracking-normal text-[#111111] md:text-[36px]">Die {displayLabel}</h1>
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#e5e5e0] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#44443f]">
                <span className="h-2 w-2 rounded-full bg-[#111111]" />
                {tile.stepLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#66665f]">
              <span className="inline-flex items-center gap-1.5 text-[#98968a]">
                <ClockIcon />
                Last updated 2h ago by adam
              </span>
            </div>
          </div>

          <div className="wafer-die-detail-actions flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canNavigateBack}
              onClick={() => onNavigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-[#e2e2de] bg-white text-[#44443f] hover:bg-[#fafafa] disabled:opacity-40"
              aria-label="Previous die"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              disabled={!canNavigateForward}
              onClick={() => onNavigate(1)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-[#e2e2de] bg-white text-[#44443f] hover:bg-[#fafafa] disabled:opacity-40"
              aria-label="Next die"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="wafer-die-detail-tabs mt-5 border-b border-[#eeeeea] md:mt-7">
          <div className="wafer-die-detail-tabs__list flex overflow-x-auto bg-white">
            {dieDetailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "wafer-die-detail-tabs__button relative flex h-14 shrink-0 items-center justify-center px-6 text-[14px] font-semibold",
                  activeTab === tab.id ? "text-[#111111]" : "text-[#66665f] hover:bg-[#fafafa]"
                ].join(" ")}
              >
                {tab.label}
                {activeTab === tab.id ? (
                  <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#111111]" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <WaferDieDetailTabs
        key={`${tile.id}:${tile.notesSurfaceValue ?? ""}:${tile.legacyNote ?? ""}`}
        activeTab={activeTab}
        tile={tile}
        canEdit={canEdit}
        currentUser={currentUser}
        onOpenNotes={() => setActiveTab("notes")}
      />
    </section>
  );
}
