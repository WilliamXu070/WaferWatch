"use client";

import { useMemo, useState } from "react";
import { ActivityIcon, ChevronRightIcon, StackIcon, TargetIcon, WaferLogoIcon } from "../icons";
import type { WaferFamilyModel, WaferStatusMetric, WaferStatusModel, WaferStatusTileModel, WaferTileStatus } from "../types";
import { WaferGeometryPreview } from "./WaferGeometryPreview";

const statusDotColor: Record<WaferTileStatus, string> = {
  litho: "bg-[#5f7e56]",
  etch: "bg-[#5f7e56]",
  inspection: "bg-[#5f7e56]",
  bond: "bg-[#647a8f]",
  test: "bg-[#727a73]",
  dice: "bg-[#727a73]",
  queued: "bg-[#b2bab0]"
};

const metricIcons = {
  neutral: WaferLogoIcon,
  active: StackIcon,
  running: TargetIcon,
  yield: ActivityIcon
} as const;

function parseDieLabelIndex(value: string): number | undefined {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const codedMatches = normalized.match(/[A-Z]+[0-9]+/g);

  if (codedMatches?.length) {
    const bestMatch = [...codedMatches].reverse().find((match) => /^[A-Z]{1,3}[0-9]+$/.test(match));
    if (bestMatch) {
      const parsed = Number(bestMatch.replace(/^[A-Z]+/, ""));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  const digitMatch = normalized.match(/\d+/);
  if (!digitMatch) {
    return undefined;
  }

  const parsed = Number(digitMatch[0]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getSelectedDieLabel(tile: WaferStatusTileModel) {
  return parseDieLabelIndex(tile.dieLabel || tile.code);
}

function getWaferDisplayLabel(tile: WaferStatusTileModel) {
  return tile.code || tile.family;
}

function isUndicedMode(tile: WaferStatusTileModel) {
  return tile.mode ? tile.mode === "undiced" : Boolean(tile.isUndiced);
}

function MetricTile({ metric }: { metric: WaferStatusMetric }) {
  const Icon = metricIcons[metric.tone];

  return (
    <div className="grid min-h-[108px] grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-[#d5d9cf] bg-[#f8f9f5] px-5 shadow-[0_10px_24px_-20px_rgba(24,31,36,0.35)]">
      <span
        className={[
          "grid h-11 w-11 place-items-center rounded-lg border",
          metric.tone === "yield"
            ? "border-[#c1d3ba] bg-[#ecf4e8] text-[#4f6f4b]"
            : "border-[#d8ddd3] bg-[#f0f3ed] text-[#576156]"
        ].join(" ")}
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-[32px] font-semibold leading-none tracking-normal text-[#171a16]">
          {metric.value}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#757d73]">{metric.label}</p>
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
        "relative grid min-h-[132px] grid-cols-[minmax(82px,0.9fr)_minmax(112px,1.1fr)] gap-3 rounded-xl border bg-[#fbfcfa] p-4 text-left transition-all",
        selected
          ? "border-[#697f65] shadow-[0_0_0_1px_rgba(105,127,101,0.32),0_14px_28px_-24px_rgba(32,43,29,0.45)]"
          : "border-[#d9ddd3] hover:-translate-y-px hover:border-[#bbc4b8] hover:bg-[#f6f8f3]"
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold leading-none text-[#171a16]">
          {getWaferDisplayLabel(tile)}
        </span>
        <span className="mt-4 flex items-center gap-2 text-[13px] font-medium text-[#666f64]">
          <span className={["h-2.5 w-2.5 rounded-full", statusDotColor[tile.status]].join(" ")} />
          {tile.stepLabel}
        </span>
      </span>
      <span className="grid min-h-[86px] place-items-center rounded-lg border border-[#d4d9d0] bg-[#f3f6ef] px-2 py-1">
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
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#1f2b1f] text-[12px] font-semibold text-white">
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
    <section className="rounded-2xl border border-[#d8ddd3] bg-[#fbfcf8] shadow-[0_12px_32px_-28px_rgba(22,29,35,0.35)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left"
      >
        <span
          className={[
            "h-3.5 w-3.5 rounded-full",
            family.status === "active" ? "bg-[#648459]" : "bg-[#b7bdb3]"
          ].join(" ")}
        />
        <span className={["text-[24px] font-semibold leading-none tracking-normal", familyMuted ? "text-[#818980]" : "text-[#171a16]"].join(" ")}>
          {family.name}
        </span>
        <span className="rounded-md bg-[#e8ede4] px-2 py-0.5 text-[12px] font-semibold text-[#61695f]">
          {family.tiles.length}
        </span>
        <ChevronRightIcon
          className={[
            "ml-auto text-[#6a7268] transition-transform",
            open ? "rotate-90" : "rotate-0"
          ].join(" ")}
        />
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-3 border-t border-[#e5e9e0] p-4 md:grid-cols-2 xl:grid-cols-4">
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
  const displayLabel = getWaferDisplayLabel(selectedTile);

  return (
    <aside className="grid gap-4 rounded-2xl border border-[#d5d9cf] bg-[#fbfcf8] p-5 shadow-[0_14px_36px_-28px_rgba(22,29,35,0.42)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[#778075]">
            {isUndiced ? "Selected wafer" : "Selected die"}
          </p>
          <h2 className="mt-1 text-[24px] font-semibold leading-none text-[#171a16]">
            {displayLabel}
          </h2>
        </div>
        <span className="rounded-md border border-[#c4d0bf] bg-[#edf4e9] px-2.5 py-1 text-[12px] font-semibold text-[#4f6f4b]">
          {selectedTile.stepLabel}
        </span>
      </div>

      <div className="grid min-h-[260px] place-items-center rounded-xl border border-[#d4d9d0] bg-[#f3f6ef] p-5">
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

function EmptyWaferStatusState() {
  return (
    <section className="rounded-2xl border border-dashed border-[#cbd2c7] bg-[#fbfcf8] p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#778075]">
        Backend wafer viewer
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#171a16]">
        No wafers available
      </h2>
      <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-6 text-[#687166]">
        Authenticated Supabase data loaded, but this project state has no wafers visible to the current session.
      </p>
    </section>
  );
}

export function WaferStatusView({ model }: { model: WaferStatusModel }) {
  const initialSelected = useMemo(
    () =>
      model.families
        .flatMap((family) => family.tiles)
        .find((tile) => tile.isSelected) ?? model.families[0]?.tiles[0] ?? null,
    [model]
  );
  const [selectedTile, setSelectedTile] = useState<WaferStatusTileModel | null>(initialSelected);
  const selectedUndiced = selectedTile ? isUndicedMode(selectedTile) : false;
  const hasWafers = model.families.some((family) => family.tiles.length > 0);

  return (
    <div className="grid gap-5 p-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {model.metrics.map((metric) => (
          <MetricTile key={metric.id} metric={metric} />
        ))}
      </section>

      {hasWafers ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            {model.families.map((family) => (
              <FamilySection
                key={family.id}
                family={family}
                selectedTile={selectedTile}
                onSelect={setSelectedTile}
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
        <EmptyWaferStatusState />
      )}

    </div>
  );
}
