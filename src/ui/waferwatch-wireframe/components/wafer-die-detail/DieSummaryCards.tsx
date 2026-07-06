import type { WaferStatusTileModel } from "../../types";
import { WaferGeometryPreview } from "../WaferGeometryPreview";
import { DetailCard } from "./DetailCard";
import { getSelectedDieLabel, statusLabel } from "./waferDieDetailHelpers";

export function DiePreviewCard({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <DetailCard title="Die preview">
      <div className="grid min-h-[220px] place-items-center bg-white p-6">
        <WaferGeometryPreview
          modeKeyword={tile.waferStateName}
          selectedLabel={getSelectedDieLabel(tile)}
          selectedDieCode={tile.dieLabel || tile.code}
          colorSeed={tile.family}
          showOnlySelectedDie
          showDieLabel={false}
          className="max-h-[210px]"
        />
      </div>
    </DetailCard>
  );
}

export function CurrentStepCard({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <DetailCard title="Current step">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-semibold leading-none text-[#111111]">{tile.stepLabel}</h2>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2 py-1 text-[12px] font-semibold text-[#44443f]">
          {statusLabel(tile)}
        </span>
      </div>
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[#6b6a5f]">
          <span>Step 4 of 8</span>
          <span>50%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#eeeeea]">
          <div className="h-full w-1/2 rounded-full bg-[#111111]" />
        </div>
      </div>
      <dl className="mt-8 grid gap-5 text-[14px]">
        {[
          ["Started", "Jul 1, 2025 - 10:42 AM"],
          ["Est. completion", "Jul 1, 2025 - 2:00 PM"],
          ["Operator", "adam"]
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-4">
            <dt className="font-medium text-[#777770]">{label}</dt>
            <dd className="font-semibold text-[#111111]">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailCard>
  );
}

export function KeyResultsCard() {
  return (
    <DetailCard title="Key results">
      <div className="grid gap-5">
        <div className="border-b border-[#eeeeea] pb-4">
          <p className="text-[12px] font-medium text-[#777770]">Uniformity</p>
          <p className="mt-1 text-[24px] font-semibold text-[#111111]">Pending</p>
        </div>
        <div>
          <p className="mb-3 text-[12px] font-medium text-[#777770]">Best image</p>
          <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-[#ddddda] bg-white text-[13px] font-semibold text-[#8a8a83]">
            No image yet
          </div>
        </div>
      </div>
    </DetailCard>
  );
}
