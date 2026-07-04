"use client";

import { useMemo, useState } from "react";
import {
  ActivityIcon,
  ChevronRightIcon,
  StackIcon,
  TargetIcon,
  WaferLogoIcon
} from "../icons";
import type {
  WaferFamilyModel,
  WaferStatusMetric,
  WaferStatusModel,
  WaferStatusTileModel,
  WaferTileStatus
} from "../types";
import { WaferGeometryPreview } from "./WaferGeometryPreview";
import {
  canOpenDieDetail,
  DieDetailView,
  getSelectedDieLabel,
  getWaferDisplayLabel,
  isUndicedMode
} from "./wafer-die-detail";

const statusDotColor: Record<WaferTileStatus, string> = {
  litho: "bg-[#161613]",
  etch: "bg-[#161613]",
  inspection: "bg-[#161613]",
  bond: "bg-[#8a887b]",
  test: "bg-[#8a887b]",
  dice: "bg-[#8a887b]",
  queued: "bg-[#c9c8ba]"
};

const metricIcons = {
  neutral: WaferLogoIcon,
  active: StackIcon,
  running: TargetIcon,
  yield: ActivityIcon
} as const;

function MetricTile({ metric }: { metric: WaferStatusMetric }) {
  const Icon = metricIcons[metric.tone];

  return (
    <div className="grid min-h-[108px] grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-[#e5e5db] bg-white px-5 shadow-[0_10px_24px_-20px_rgba(30,29,22,0.28)]">
      <span
        className={[
          "grid h-11 w-11 place-items-center rounded-lg border",
          metric.tone === "yield"
            ? "border-[#dcdbca] bg-[#f2f2e8] text-[#161613]"
            : "border-[#e5e4d8] bg-[#f7f7ef] text-[#55534a]"
        ].join(" ")}
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-[32px] font-semibold leading-none tracking-normal text-[#151512]">
          {metric.value}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#8a887b]">{metric.label}</p>
      </div>
    </div>
  );
}

function WaferTile({
  tile,
  selected,
  isUndiced,
  onSelect
}: {
  tile: WaferStatusTileModel;
  selected: boolean;
  isUndiced: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "relative grid min-h-[132px] grid-cols-[minmax(82px,0.9fr)_minmax(112px,1.1fr)] gap-3 rounded-xl border bg-white p-4 text-left transition-all",
        selected
          ? "border-[#161613] shadow-[0_0_0_1px_rgba(22,22,19,0.28),0_14px_28px_-24px_rgba(30,29,22,0.4)]"
          : "border-[#e5e4d8] hover:-translate-y-px hover:border-[#cfcec0] hover:bg-[#fbfbf6]"
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold leading-none text-[#151512]">
          {getWaferDisplayLabel(tile, isUndiced)}
        </span>
        <span className="mt-4 flex items-center gap-2 text-[13px] font-medium text-[#6b6a5f]">
          <span className={["h-2.5 w-2.5 rounded-full", statusDotColor[tile.status]].join(" ")} />
          {tile.stepLabel}
        </span>
      </span>
      <span className="grid min-h-[86px] place-items-center rounded-lg border border-[#e7e6da] bg-[#f7f7ef] px-2 py-1">
        <WaferGeometryPreview
          modeKeyword={tile.waferStateName}
          selectedLabel={getSelectedDieLabel(tile)}
          selectedDieCode={isUndiced ? undefined : (tile.dieLabel || tile.code)}
          colorSeed={tile.family}
          showOnlySelectedDie={!isUndiced}
          showDieLabel={false}
          dimmed={tile.status === "queued"}
          className="max-h-[78px]"
        />
      </span>
      {selected ? (
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#161613] text-[12px] font-semibold text-white">
          ✓
        </span>
      ) : null}
    </button>
  );
}

function FamilySection({
  family,
  selectedTile,
  onSelect
}: {
  family: WaferFamilyModel;
  selectedTile: WaferStatusTileModel | null;
  onSelect: (tile: WaferStatusTileModel) => void;
}) {
  const [open, setOpen] = useState(true);
  const familyMuted = family.status === "setup";

  return (
    <section className="rounded-2xl border border-[#e5e5db] bg-white shadow-[0_12px_32px_-28px_rgba(30,29,22,0.3)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left"
      >
        <span
          className={[
            "h-3.5 w-3.5 rounded-full",
            family.status === "active" ? "bg-[#161613]" : "bg-[#c9c8ba]"
          ].join(" ")}
        />
        <span className={["text-[24px] font-semibold leading-none tracking-normal", familyMuted ? "text-[#98968a]" : "text-[#151512]"].join(" ")}>
          {family.name}
        </span>
        <span className="rounded-md bg-[#efefe3] px-2 py-0.5 text-[12px] font-semibold text-[#55534a]">
          {family.tiles.length}
        </span>
        <ChevronRightIcon
          className={[
            "ml-auto text-[#8a887b] transition-transform",
            open ? "rotate-90" : "rotate-0"
          ].join(" ")}
        />
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-3 border-t border-[#eeeee4] p-4 md:grid-cols-2 xl:grid-cols-4">
          {family.tiles.map((tile) => (
            <WaferTile
              key={tile.id}
              tile={tile}
              isUndiced={isUndicedMode(tile)}
              selected={selectedTile?.id === tile.id}
              onSelect={() => onSelect(tile)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SelectedDiePanel({
  selectedTile,
  isUndiced
}: {
  selectedTile: WaferStatusTileModel;
  isUndiced: boolean;
}) {
  const displayLabel = getWaferDisplayLabel(selectedTile, isUndiced);

  return (
    <aside className="grid gap-4 rounded-2xl border border-[#e5e5db] bg-white p-5 shadow-[0_14px_36px_-28px_rgba(30,29,22,0.32)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[#98968a]">
            {isUndiced ? "Selected wafer" : "Selected die"}
          </p>
          <h2 className="mt-1 text-[24px] font-semibold leading-none text-[#151512]">
            {displayLabel}
          </h2>
        </div>
        <span className="rounded-md border border-[#dcdbca] bg-[#f2f2e8] px-2.5 py-1 text-[12px] font-semibold text-[#161613]">
          {selectedTile.stepLabel}
        </span>
      </div>

      <div className="grid min-h-[260px] place-items-center rounded-xl border border-[#e7e6da] bg-[#f7f7ef] p-5">
        <WaferGeometryPreview
          modeKeyword={selectedTile.waferStateName}
          selectedLabel={getSelectedDieLabel(selectedTile)}
          selectedDieCode={isUndiced ? undefined : (selectedTile.dieLabel || selectedTile.code)}
          colorSeed={selectedTile.family}
          showOnlySelectedDie={!isUndiced}
          showDieLabel={false}
          className="max-h-[320px]"
        />
      </div>
    </aside>
  );
}

function EmptyWaferStatusState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98968a]">
        Backend wafer viewer
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#151512]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-6 text-[#6b6a5f]">
        {description}
      </p>
    </section>
  );
}

export function WaferStatusView({
  model,
  emptyTitle = "No wafers available",
  emptyDescription = "Authenticated Supabase data loaded, but this project state has no wafers visible to the current session."
}: {
  model: WaferStatusModel;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const initialSelected = useMemo(
    () =>
      model.families
        .flatMap((family) => family.tiles)
        .find((tile) => tile.isSelected) ?? model.families[0]?.tiles[0] ?? null,
    [model]
  );
  const [selectedTile, setSelectedTile] = useState<WaferStatusTileModel | null>(initialSelected);
  const [detailTile, setDetailTile] = useState<WaferStatusTileModel | null>(null);
  const selectedUndiced = selectedTile ? isUndicedMode(selectedTile) : false;
  const hasWafers = model.families.some((family) => family.tiles.length > 0);
  const detailTiles = model.families
    .flatMap((family) => family.tiles)
    .filter(canOpenDieDetail);
  const activeDetailTile = detailTile
    ? detailTiles.find((tile) => tile.id === detailTile.id) ?? detailTile
    : null;
  const activeDetailIndex = activeDetailTile
    ? detailTiles.findIndex((tile) => tile.id === activeDetailTile.id)
    : -1;

  const handleSelectTile = (tile: WaferStatusTileModel) => {
    setSelectedTile(tile);
    if (canOpenDieDetail(tile)) {
      setDetailTile(tile);
    }
  };

  const handleNavigateDetail = (direction: -1 | 1) => {
    const nextTile = detailTiles[activeDetailIndex + direction];
    if (!nextTile) return;
    setSelectedTile(nextTile);
    setDetailTile(nextTile);
  };

  if (hasWafers && activeDetailTile) {
    return (
      <div className="grid gap-5 p-6">
        <DieDetailView
          tile={activeDetailTile}
          onBack={() => setDetailTile(null)}
          onNavigate={handleNavigateDetail}
          canNavigateBack={activeDetailIndex > 0}
          canNavigateForward={activeDetailIndex >= 0 && activeDetailIndex < detailTiles.length - 1}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-6">
      {hasWafers ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {model.metrics.map((metric) => (
            <MetricTile key={metric.id} metric={metric} />
          ))}
        </section>
      ) : null}

      {hasWafers ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            {model.families.map((family) => (
              <FamilySection
                key={family.id}
                family={family}
                selectedTile={selectedTile}
                onSelect={handleSelectTile}
              />
            ))}
          </div>
          {selectedTile ? (
            <SelectedDiePanel
              selectedTile={selectedTile}
              isUndiced={selectedUndiced}
            />
          ) : null}
        </section>
      ) : (
        <EmptyWaferStatusState
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </div>
  );
}
