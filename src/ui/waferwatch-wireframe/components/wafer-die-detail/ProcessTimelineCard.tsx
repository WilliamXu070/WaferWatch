import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import { ProcessTimelineTree } from "./ProcessTimelineTree";

const keyParameterRows = [
  ["Current focus", "Uniformity review"],
  ["Best image", "Pending"],
  ["Source step", "Current process step"],
  ["Review state", "In progress"]
] as const;

export function ProcessTimelineCard({ tile }: { tile: WaferStatusTileModel }) {
  const processSteps = tile.processSteps?.length ? tile.processSteps : [];
  const currentStep = processSteps.find((step) => step.id === tile.currentStepId) ?? null;
  const currentKeyParameterRows = keyParameterRows.map(([label, value]) => {
    if (label === "Source step") {
      return [label, currentStep?.name ?? tile.stepLabel] as const;
    }

    return [label, value] as const;
  });

  return (
    <DetailCard title="Process timeline" className="lg:col-span-3">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ProcessTimelineTree tile={tile} />

        <div className="border-l border-[#eeeeea] pl-5">
          <h3 className="mb-4 text-[17px] font-semibold text-[#111111]">Key parameter information</h3>
          <dl className="grid max-w-[520px] gap-3 text-[14px]">
            {currentKeyParameterRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-b border-[#eeeeea] pb-3">
                <dt className="text-[#66665f]">{label}</dt>
                <dd className="font-semibold text-[#111111]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </DetailCard>
  );
}
