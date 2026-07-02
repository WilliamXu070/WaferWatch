"use client";

import { useEffect, useMemo, useState } from "react";
import { WaferCutVisualizer } from "@/components/WaferCutVisualizer";
import type { WaferMode } from "@/features/wafers/geometry";
import { ActivityIcon, ChevronRightIcon, StackIcon, TargetIcon, WaferLogoIcon } from "../icons";
import { waferStatusModel } from "../mock-data";
import type {
  WaferFamilyModel,
  WaferStatusMetric,
  WaferStatusTileModel,
  WaferTileStatus
} from "../types";
import { loadWaferGeometry, WaferGeometryPreview, type WaferGeometry } from "./WaferGeometryPreview";

const statusDotColor: Record<WaferTileStatus, string> = {
  litho: "bg-[#29a329]",
  etch: "bg-[#29a329]",
  inspection: "bg-[#29a329]",
  bond: "bg-[#1683d8]",
  test: "bg-[#6d7378]",
  dice: "bg-[#6d7378]",
  queued: "bg-[#b8bdc1]"
};

const metricIcons = {
  neutral: WaferLogoIcon,
  active: StackIcon,
  running: TargetIcon,
  yield: ActivityIcon
} as const;

function getWaferMode(tile: WaferStatusTileModel): WaferMode {
  return tile.waferStateName.toLowerCase().includes("pre") ? "pre-dice" : "post-dice";
}

function getSelectedDieLabel(tile: WaferStatusTileModel) {
  const match = tile.code.match(/\d+$/);
  return match ? Number(match[0]) : undefined;
}

function MetricTile({ metric }: { metric: WaferStatusMetric }) {
  const Icon = metricIcons[metric.tone];

  return (
    <div className="grid min-h-[108px] grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-lg border border-[#d7d9d6] bg-[#fbfcfa] px-5 shadow-[0_10px_24px_-20px_rgba(24,31,36,0.45)]">
      <span
        className={[
          "grid h-11 w-11 place-items-center rounded-lg border",
          metric.tone === "yield"
            ? "border-[#b7d8ba] bg-[#e7f4e4] text-[#2d7d35]"
            : "border-[#d8deda] bg-[#f1f4f1] text-[#4f5a61]"
        ].join(" ")}
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-[32px] font-semibold leading-none tracking-normal text-[#161a1d]">
          {metric.value}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#73787d]">{metric.label}</p>
      </div>
    </div>
  );
}

function WaferTile({
  tile,
  geometry,
  selected,
  onSelect
}: {
  tile: WaferStatusTileModel;
  geometry: WaferGeometry | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const dieLabel = getSelectedDieLabel(tile);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "relative grid min-h-[132px] grid-cols-[minmax(82px,0.9fr)_minmax(112px,1.1fr)] gap-3 rounded-lg border bg-[#fbfcfa] p-4 text-left transition-colors",
        selected
          ? "border-[#4269a8] shadow-[0_0_0_1px_rgba(66,105,168,0.42),0_14px_28px_-24px_rgba(26,45,74,0.65)]"
          : "border-[#dfe1dd] hover:border-[#a8b0b7] hover:bg-[#f7f9f6]"
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold leading-none text-[#171b1f]">{tile.code}</span>
        <span className="mt-4 flex items-center gap-2 text-[13px] font-medium text-[#6f757a]">
          <span className={["h-2.5 w-2.5 rounded-full", statusDotColor[tile.status]].join(" ")} />
          {tile.stepLabel}
        </span>
      </span>
      <span className="grid min-h-[86px] place-items-center rounded-md border border-[#d1d6d4] bg-[#f5f7f4] px-2 py-1">
        <WaferGeometryPreview
          geometry={geometry}
          mode={getWaferMode(tile)}
          selectedLabel={dieLabel}
          dimmed={tile.status === "queued"}
        />
      </span>
      {selected ? (
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#101820] text-[12px] font-semibold text-white">
          ✓
        </span>
      ) : null}
    </button>
  );
}

function FamilySection({
  family,
  geometry,
  selectedTile,
  onSelect
}: {
  family: WaferFamilyModel;
  geometry: WaferGeometry | null;
  selectedTile: WaferStatusTileModel;
  onSelect: (tile: WaferStatusTileModel) => void;
}) {
  const [open, setOpen] = useState(true);
  const familyMuted = family.status === "setup";

  return (
    <section className="rounded-lg border border-[#dfe1dd] bg-[#fbfcfa] shadow-[0_12px_32px_-28px_rgba(22,29,35,0.5)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left"
      >
        <span
          className={[
            "h-3.5 w-3.5 rounded-full",
            family.status === "active" ? "bg-[#2dac2b]" : "bg-[#bec2c5]"
          ].join(" ")}
        />
        <span className={["text-[24px] font-semibold leading-none tracking-normal", familyMuted ? "text-[#7f8589]" : "text-[#15191c]"].join(" ")}>
          {family.name}
        </span>
        <span className="rounded-md bg-[#eef0ed] px-2 py-0.5 text-[12px] font-semibold text-[#687076]">
          {family.tiles.length}
        </span>
        <ChevronRightIcon
          className={[
            "ml-auto text-[#697077] transition-transform",
            open ? "rotate-90" : "rotate-0"
          ].join(" ")}
        />
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-3 border-t border-[#eceeea] p-4 md:grid-cols-2 xl:grid-cols-4">
          {family.tiles.map((tile) => (
            <WaferTile
              key={tile.id}
              tile={tile}
              geometry={geometry}
              selected={selectedTile.id === tile.id}
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
  geometry
}: {
  selectedTile: WaferStatusTileModel;
  geometry: WaferGeometry | null;
}) {
  const dieLabel = getSelectedDieLabel(selectedTile);

  return (
    <aside className="grid gap-4 rounded-lg border border-[#d7d9d6] bg-[#fbfcfa] p-5 shadow-[0_14px_36px_-28px_rgba(22,29,35,0.55)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#7a8186]">
            Selected die
          </p>
          <h2 className="mt-1 text-[24px] font-semibold leading-none text-[#15191c]">
            {selectedTile.family} {selectedTile.code}
          </h2>
        </div>
        <span className="rounded-md border border-[#cdd4dc] bg-[#eef4ff] px-2.5 py-1 text-[12px] font-semibold text-[#315b9d]">
          {selectedTile.stepLabel}
        </span>
      </div>

      <div className="grid min-h-[260px] place-items-center rounded-lg border border-[#d6dbd8] bg-[#f5f7f4] p-5">
        <WaferGeometryPreview
          geometry={geometry}
          mode={getWaferMode(selectedTile)}
          selectedLabel={dieLabel}
          className="max-h-[320px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-md border border-[#e0e3df] bg-[#f7f8f6] p-3">
          <p className="font-semibold text-[#171b1f]">Cut recipe</p>
          <p className="mt-1 text-[#747a7f]">4in wafer, 8 die split</p>
        </div>
        <div className="rounded-md border border-[#e0e3df] bg-[#f7f8f6] p-3">
          <p className="font-semibold text-[#171b1f]">Overlay</p>
          <p className="mt-1 text-[#747a7f]">3 x 15 array clipped to die</p>
        </div>
      </div>
    </aside>
  );
}

export function WaferStatusView() {
  const initialSelected = useMemo(
    () =>
      waferStatusModel.families
        .flatMap((family) => family.tiles)
        .find((tile) => tile.isSelected) ?? waferStatusModel.families[0].tiles[0],
    []
  );
  const [selectedTile, setSelectedTile] = useState<WaferStatusTileModel>(initialSelected);
  const [geometry, setGeometry] = useState<WaferGeometry | null>(null);
  const allTiles = useMemo(() => waferStatusModel.families.flatMap((family) => family.tiles), []);
  const visualizerSamples = useMemo(
    () =>
      allTiles.map((tile) => ({
        id: tile.id,
        name: `${tile.family}-${tile.code}`,
        stateName: tile.waferStateName,
        statusLabel: tile.stepLabel,
        assignmentLabel: "wireframe preview",
        nextStepName: tile.status === "dice" ? "Review" : "Next process",
        currentHandlerName: tile.family === "BETA" ? "Barbara" : "Adam"
      })),
    [allTiles]
  );

  useEffect(() => {
    let isStale = false;
    void loadWaferGeometry().then((nextGeometry) => {
      if (!isStale) {
        setGeometry(nextGeometry);
      }
    });

    return () => {
      isStale = true;
    };
  }, []);

  return (
    <div className="grid gap-5 p-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {waferStatusModel.metrics.map((metric) => (
          <MetricTile key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          {waferStatusModel.families.map((family) => (
            <FamilySection
              key={family.id}
              family={family}
              geometry={geometry}
              selectedTile={selectedTile}
              onSelect={setSelectedTile}
            />
          ))}
        </div>
        <SelectedDiePanel selectedTile={selectedTile} geometry={geometry} />
      </section>

      <section className="rounded-lg border border-[#d7d9d6] bg-[#fbfcfa] p-5 shadow-[0_14px_36px_-28px_rgba(22,29,35,0.55)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#7a8186]">
              Full wafer viewer
            </p>
            <h2 className="mt-1 text-[20px] font-semibold leading-none text-[#15191c]">
              Geometry and array interaction
            </h2>
          </div>
          <span className="text-[13px] font-medium text-[#747a7f]">
            Mock-safe preview data
          </span>
        </div>
        <WaferCutVisualizer wafers={visualizerSamples} />
      </section>
    </div>
  );
}
