import { DetailCard } from "./DetailCard";
import { pulseResults } from "./waferDieDetailData";

export function ResultsSequenceCard() {
  return (
    <DetailCard title="Result sequence" action="View full sequence" className="lg:col-span-3">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#6b6a5f]">
        <span>Step 4 of 8</span>
        <span>•</span>
        <span>Fixture poling</span>
        <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] font-semibold text-[#4f7a43]">In progress</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pulseResults.map((value, index) => {
          const pulse = index + 1;
          return (
            <article
              key={pulse}
              className={[
                "rounded-xl border bg-white p-3",
                pulse === 8 ? "border-[#6b6a5f] shadow-[0_0_0_1px_rgba(107,106,95,0.25)]" : "border-[#e8e8de]"
              ].join(" ")}
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-[#151512]">Pulse {pulse}</h4>
                {pulse === 8 ? (
                  <span className="rounded-md bg-[#dff0d6] px-2 py-0.5 text-[11px] font-semibold text-[#4f7a43]">Best</span>
                ) : null}
              </div>
              <div className="h-24 rounded-lg border border-dashed border-[#deded3] bg-[#f8f8f1]" />
              <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-[#4a483f]">
                <span className={["h-2.5 w-2.5 rounded-full", pulse === 3 || pulse === 4 ? "bg-[#d9a441]" : "bg-[#6b7f57]"].join(" ")} />
                {value}
              </p>
            </article>
          );
        })}
      </div>
    </DetailCard>
  );
}
