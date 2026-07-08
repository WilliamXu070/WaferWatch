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
  litho: "bg-[#111111]",
  etch: "bg-[#111111]",
  inspection: "bg-[#111111]",
  bond: "bg-[#777770]",
  test: "bg-[#777770]",
  dice: "bg-[#777770]",
  queued: "bg-[#c9c9c2]"
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
    <div className="grid min-h-[88px] grid-cols-[28px_minmax(0,1fr)] items-center gap-4 border-b border-[#eeeeee] bg-white px-2 py-4">
      <span className="grid h-7 w-7 place-items-center text-[#7a7a72]">
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-[32px] font-semibold leading-none tracking-normal text-[#111111]">
          {metric.value}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#7a7a72]">{metric.label}</p>
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
        "relative grid min-h-[118px] grid-cols-[minmax(76px,0.9fr)_minmax(104px,1.1fr)] gap-4 rounded-lg border bg-white p-4 text-left transition-all",
        selected
          ? "border-[#111111] shadow-[0_0_0_1px_rgba(17,17,17,0.16)]"
          : "border-[#e7e7e2] hover:border-[#b9b9b0] hover:bg-[#fcfcfb]"
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold leading-none text-[#111111]">
          {getWaferDisplayLabel(tile, isUndiced)}
        </span>
        <span className="mt-4 flex items-center gap-2 text-[13px] font-medium text-[#6f6f68]">
          <span className={["h-2.5 w-2.5 rounded-full", statusDotColor[tile.status]].join(" ")} />
          {tile.stepLabel}
        </span>
      </span>
      <span className="grid min-h-[80px] place-items-center rounded-md border border-[#eeeeea] bg-white px-2 py-1">
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
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#111111] text-[12px] font-semibold text-white">
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
    <section className="border-b border-[#e7e7e2] bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-2 py-4 text-left"
      >
        <span
          className={[
            "h-2.5 w-2.5 rounded-full",
            family.status === "active" ? "bg-[#111111]" : "bg-[#c9c9c2]"
          ].join(" ")}
        />
        <span className={["text-[24px] font-semibold leading-none tracking-normal", familyMuted ? "text-[#9b9b94]" : "text-[#111111]"].join(" ")}>
          {family.name}
        </span>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2 py-0.5 text-[12px] font-semibold text-[#5d5d56]">
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
        <div className="grid grid-cols-1 gap-3 pb-5 md:grid-cols-2 xl:grid-cols-4">
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
    <aside className="selected-die-panel grid gap-5 border-t border-[#eeeeea] bg-white pt-5 xl:sticky xl:top-6 xl:max-h-[calc(100svh-8rem)] xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9b9b94]">
            {isUndiced ? "Selected wafer" : "Selected die"}
          </p>
          <h2 className="mt-1 text-[28px] font-semibold leading-none text-[#111111]">
            {displayLabel}
          </h2>
        </div>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#222222]">
          {selectedTile.stepLabel}
        </span>
      </div>

      <div className="grid min-h-[420px] place-items-center bg-white p-4">
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
    <section className="border border-dashed border-[#ddddda] bg-white p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9b9b94]">
        Backend wafer viewer
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#111111]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-6 text-[#6f6f68]">
        {description}
      </p>
    </section>
  );
}

export function WaferStatusView({
  model,
  canEdit = true,
  emptyTitle = "No wafers available",
  emptyDescription = "Authenticated Supabase data loaded, but this project state has no wafers visible to the current session."
}: {
  model: WaferStatusModel;
  canEdit?: boolean;
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
    <div className="wafer-status-detail-page grid gap-5 bg-white p-4 md:p-6">
        <DieDetailView
          tile={activeDetailTile}
          canEdit={canEdit}
          onBack={() => setDetailTile(null)}
          onNavigate={handleNavigateDetail}
          canNavigateBack={activeDetailIndex > 0}
          canNavigateForward={activeDetailIndex >= 0 && activeDetailIndex < detailTiles.length - 1}
        />
      </div>
    );
  }

  return (
    <div className="wafer-status-page grid gap-5 bg-white p-4 md:gap-6 md:p-6">
      {hasWafers ? (
        <section className="grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-4">
          {model.metrics.map((metric) => (
            <MetricTile key={metric.id} metric={metric} />
          ))}
        </section>
      ) : null}

      {hasWafers ? (
        <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-5">
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
