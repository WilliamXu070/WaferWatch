"use client";

import { useState } from "react";
import type { WaferStatusTileModel } from "../../types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DotsIcon
} from "../../icons";
import { dieDetailTabs, type DieDetailTab } from "./waferDieDetailData";
import { getDieIdentity } from "./waferDieDetailHelpers";
import { WaferDieDetailTabs } from "./WaferDieDetailTabs";

export function DieDetailView({
  tile,
  onBack,
  onNavigate,
  canNavigateBack,
  canNavigateForward
}: {
  tile: WaferStatusTileModel;
  onBack: () => void;
  onNavigate: (direction: -1 | 1) => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DieDetailTab>("overview");
  const identity = getDieIdentity(tile);
  const displayLabel = tile.dieLabel || tile.code;

  return (
    <section className="grid gap-4 rounded-[22px] bg-[#f8f8f2] p-4 shadow-[inset_0_0_0_1px_rgba(232,232,222,0.74)]">
      <div className="rounded-[18px] bg-white px-7 py-6 shadow-[0_20px_48px_-42px_rgba(30,29,22,0.55)]">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#8a887b]">
          <button type="button" onClick={onBack} className="hover:text-[#151512]">Wafers</button>
          <ChevronRightIcon />
          <span>Codex Wireframe V1</span>
          <ChevronRightIcon />
          <span className="text-[#151512]">Die {displayLabel}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[36px] font-semibold leading-none tracking-normal text-[#151512]">Die {displayLabel}</h1>
              <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6e6dc] px-3 py-1.5 text-[14px] font-semibold text-[#4a483f]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6b7f57]" />
                {tile.stepLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#6b6a5f]">
              {[tile.family, `Row ${identity.row}`, `Position ${identity.position}`, `ID: ${identity.dieId}`].map((tag) => (
                <span key={tag} className="rounded-lg border border-[#e7e7dc] bg-[#fbfbf6] px-2.5 py-1">
                  {tag}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[#98968a]">
                <ClockIcon />
                Last updated 2h ago by adam
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="h-10 rounded-xl border border-[#e2e2d8] bg-white px-4 text-[14px] font-semibold text-[#4a483f] hover:bg-[#f8f8f1]">
              Export report
            </button>
            <button type="button" className="grid h-10 w-12 place-items-center rounded-xl border border-[#e2e2d8] bg-white text-[#4a483f] hover:bg-[#f8f8f1]" aria-label="More actions">
              <DotsIcon />
            </button>
            <button
              type="button"
              disabled={!canNavigateBack}
              onClick={() => onNavigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e2d8] bg-white text-[#4a483f] hover:bg-[#f8f8f1] disabled:opacity-40"
              aria-label="Previous die"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              disabled={!canNavigateForward}
              onClick={() => onNavigate(1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e2d8] bg-white text-[#4a483f] hover:bg-[#f8f8f1] disabled:opacity-40"
              aria-label="Next die"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-[#e8e8de]">
          <div className="flex overflow-x-auto bg-white">
            {dieDetailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative flex h-14 shrink-0 items-center px-6 text-[14px] font-semibold",
                  activeTab === tab.id ? "text-[#151512]" : "text-[#6b6a5f] hover:bg-[#fbfbf6]"
                ].join(" ")}
              >
                {tab.label}
                {activeTab === tab.id ? (
                  <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#6b7f57]" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <WaferDieDetailTabs activeTab={activeTab} tile={tile} />
    </section>
  );
}
