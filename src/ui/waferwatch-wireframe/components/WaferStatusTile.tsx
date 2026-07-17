import type { WaferStatusTileModel, WaferTileStatus } from "../types";
import { WaferGeometryPreview } from "./WaferGeometryPreview";
import { DieAppearancePreview } from "./wafer-die-detail/DieAppearancePreview";
import { getSelectedDieLabel, getWaferDisplayLabel } from "./wafer-die-detail/waferDieDetailHelpers";

const statusDotColor: Record<WaferTileStatus, string> = {
  litho: "bg-[#111111]",
  etch: "bg-[#111111]",
  inspection: "bg-[#111111]",
  bond: "bg-[#777770]",
  test: "bg-[#777770]",
  dice: "bg-[#777770]",
  queued: "bg-[#c9c9c2]"
};

export function WaferStatusTile({
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
        "wafer-status-tile relative grid min-h-[118px] grid-cols-[minmax(76px,0.9fr)_minmax(104px,1.1fr)] gap-4 rounded-lg border bg-white p-4 text-left transition-all",
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
        {isUndiced ? (
          <WaferGeometryPreview
            modeKeyword={tile.waferStateName}
            selectedLabel={getSelectedDieLabel(tile)}
            colorSeed={tile.family}
            showDieLabel={false}
            className="max-h-[78px]"
          />
        ) : (
          <DieAppearancePreview tile={tile} className="max-h-[78px]" sizes="120px" />
        )}
      </span>
      {selected ? (
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#111111] text-[12px] font-semibold text-white">
          ✓
        </span>
      ) : null}
    </button>
  );
}
