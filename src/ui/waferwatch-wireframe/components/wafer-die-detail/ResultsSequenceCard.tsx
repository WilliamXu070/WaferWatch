import { DetailCard } from "./DetailCard";
import { pulseResults } from "./waferDieDetailData";

export function ResultsSequenceCard() {
  return (
    <DetailCard title="Result sequence" action="View full sequence" className="lg:col-span-3">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#6b6a5f]">
        <span>Step 4 of 8</span>
        <span>•</span>
        <span>Fixture poling</span>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2 py-1 text-[12px] font-semibold text-[#44443f]">In progress</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pulseResults.map((value, index) => {
          const pulse = index + 1;
          return (
            <article
              key={pulse}
              className={[
                "rounded-xl border bg-white p-3",
                pulse === 8 ? "border-[#111111]" : "border-[#eeeeea]"
              ].join(" ")}
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-[#151512]">Pulse {pulse}</h4>
                {pulse === 8 ? (
                  <span className="rounded-md border border-[#e4e4df] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#111111]">Best</span>
                ) : null}
              </div>
              <div className="h-24 rounded-lg border border-dashed border-[#deded8] bg-white" />
              <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-[#4a483f]">
                <span className={["h-2.5 w-2.5 rounded-full", pulse === 3 || pulse === 4 ? "bg-[#777770]" : "bg-[#111111]"].join(" ")} />
                {value}
              </p>
            </article>
          );
        })}
      </div>
    </DetailCard>
  );
}
