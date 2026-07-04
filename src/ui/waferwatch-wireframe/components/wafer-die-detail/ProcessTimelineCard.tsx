import { CheckCircleIcon } from "../../icons";
import { DetailCard } from "./DetailCard";
import { parameterRows, processTimeline } from "./waferDieDetailData";

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
                item.state === "active" ? "bg-[#f1f1e8]" : ""
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-6 w-6 place-items-center rounded-full border text-[12px] font-semibold",
                  item.state === "pending"
                    ? "border-[#d8d7cb] bg-white text-[#8a887b]"
                    : "border-[#6b7f57] bg-[#6b7f57] text-white"
                ].join(" ")}
              >
                {item.step}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[14px] text-[#151512]">{item.title}</strong>
                <span className={["text-[12px] font-medium", item.state === "active" ? "text-[#6b7f57]" : "text-[#8a887b]"].join(" ")}>
                  {item.time}
                </span>
              </span>
              {item.state === "complete" ? <CheckCircleIcon className="text-[#6b7f57]" /> : null}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border border-[#ecece1] p-5">
          <div className="mb-5 flex items-center gap-3">
            <h3 className="text-[17px] font-semibold text-[#151512]">Step 4: Fixture poling</h3>
            <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] font-semibold text-[#4f7a43]">
              In progress
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[#ecece1] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[14px] font-semibold text-[#151512]">Parameters</h4>
                <button type="button" className="rounded-md border border-[#e4e3d8] px-2 py-1 text-[12px] font-semibold text-[#6b6a5f]">
                  Edit
                </button>
              </div>
              <dl className="grid gap-3 text-[14px]">
                {parameterRows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-[#6b6a5f]">{label}</dt>
                    <dd className="font-semibold text-[#151512]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-xl border border-[#ecece1] p-4">
              <h4 className="mb-4 text-[14px] font-semibold text-[#151512]">Live log</h4>
              <div className="grid gap-3 text-[14px]">
                {[
                  ["10:42 AM", "Step started by adam"],
                  ["10:43 AM", "Fixture connected"],
                  ["10:44 AM", "Voltage ramp initiated"],
                  ["10:52 AM", "Target temperature reached"],
                  ["11:12 AM", "Holding... (15/30 min)"]
                ].map(([time, text]) => (
                  <div key={time} className="grid grid-cols-[78px_minmax(0,1fr)] gap-4">
                    <span className="font-medium text-[#98968a]">{time}</span>
                    <span className={text.startsWith("Holding") ? "font-semibold text-[#6b7f57]" : "text-[#4a483f]"}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DetailCard>
  );
}
