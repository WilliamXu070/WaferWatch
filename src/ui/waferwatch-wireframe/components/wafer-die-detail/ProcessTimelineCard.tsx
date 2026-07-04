import { CheckCircleIcon } from "../../icons";
import { DetailCard } from "./DetailCard";
import { processTimeline } from "./waferDieDetailData";

const keyParameterRows = [
  ["Current focus", "Uniformity review"],
  ["Best image", "Pending"],
  ["Source step", "Fixture inspection"],
  ["Review state", "In progress"]
] as const;

export function ProcessTimelineCard() {
  return (
    <DetailCard title="Process timeline" className="lg:col-span-3">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ol className="grid gap-1">
          {processTimeline.map((item) => (
            <li
              key={item.step}
              className={[
                "grid grid-cols-[28px_minmax(0,1fr)_18px] items-center gap-3 rounded-xl px-2 py-2",
                item.state === "active" ? "bg-[#fafafa]" : ""
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-6 w-6 place-items-center rounded-full border text-[12px] font-semibold",
                  item.state === "pending"
                    ? "border-[#d8d8d2] bg-white text-[#8a8a83]"
                    : "border-[#111111] bg-[#111111] text-white"
                ].join(" ")}
              >
                {item.step}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[14px] text-[#151512]">{item.title}</strong>
                <span className={["text-[12px] font-medium", item.state === "active" ? "text-[#111111]" : "text-[#8a8a83]"].join(" ")}>
                  {item.time}
                </span>
              </span>
              {item.state === "complete" ? <CheckCircleIcon className="text-[#111111]" /> : null}
            </li>
          ))}
        </ol>

        <div className="border-l border-[#eeeeea] pl-5">
          <h3 className="mb-4 text-[17px] font-semibold text-[#111111]">Key parameter information</h3>
          <dl className="grid max-w-[520px] gap-3 text-[14px]">
            {keyParameterRows.map(([label, value]) => (
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
