import { CheckCircleIcon } from "../../icons";
import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import { processTimeline } from "./waferDieDetailData";

const keyParameterRows = [
  ["Current focus", "Uniformity review"],
  ["Best image", "Pending"],
  ["Source step", "Fixture inspection"],
  ["Review state", "In progress"]
] as const;

const timelineAccentByFamily: Record<string, { line: string; fill: string; text: string; activeBackground: string }> = {
  ALPHA: {
    line: "#3f7534",
    fill: "#3f7534",
    text: "#2d5327",
    activeBackground: "#f3f8f1"
  },
  BETA: {
    line: "#326b98",
    fill: "#326b98",
    text: "#2b5578",
    activeBackground: "#f2f7fb"
  },
  GAMMA: {
    line: "#9f493f",
    fill: "#9f493f",
    text: "#703831",
    activeBackground: "#fbf3f2"
  }
};

function getTimelineAccent(tile: WaferStatusTileModel) {
  return timelineAccentByFamily[tile.family.trim().toUpperCase()] ?? {
    line: "#111111",
    fill: "#111111",
    text: "#111111",
    activeBackground: "#f5f5f2"
  };
}

export function ProcessTimelineCard({ tile }: { tile: WaferStatusTileModel }) {
  const accent = getTimelineAccent(tile);
  const activeIndex = processTimeline.findIndex((item) => item.state === "active");
  const completedProgressHeight = activeIndex > 0 ? `${(activeIndex / Math.max(processTimeline.length - 1, 1)) * 100}%` : "0%";

  return (
    <DetailCard title="Process timeline" className="lg:col-span-3">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ol className="relative grid gap-1">
          <span className="absolute bottom-[26px] left-[17px] top-[26px] z-10 w-px bg-[#deded8]" aria-hidden />
          <span
            className="absolute left-[17px] top-[26px] z-10 w-px"
            style={{ height: completedProgressHeight, backgroundColor: accent.line }}
            aria-hidden
          />
          {processTimeline.map((item) => (
            <li
              key={item.step}
              className={[
                "relative grid grid-cols-[28px_minmax(0,1fr)_18px] items-center gap-3 rounded-lg px-2 py-2"
              ].join(" ")}
              style={item.state === "active" ? { backgroundColor: accent.activeBackground } : undefined}
            >
              <span
                className={[
                  "relative z-20 grid h-5 w-5 place-items-center rounded-full border text-[11px] font-semibold",
                  item.state === "pending"
                    ? "border-[#d7d7d0] bg-white text-[#8a8a83]"
                    : "text-white"
                ].join(" ")}
                style={item.state === "pending" ? undefined : { backgroundColor: accent.fill, borderColor: accent.fill }}
              >
                {item.step}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[14px] text-[#151512]">{item.title}</strong>
                <span
                  className={["text-[12px] font-medium", item.state === "active" ? "" : "text-[#8a8a83]"].join(" ")}
                  style={item.state === "active" ? { color: accent.text } : undefined}
                >
                  {item.time}
                </span>
              </span>
              {item.state === "complete" ? <CheckCircleIcon style={{ color: accent.fill }} /> : null}
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
