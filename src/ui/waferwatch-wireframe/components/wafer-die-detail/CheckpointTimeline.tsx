import type { WaferStatusCheckpointHistoryEntry, WaferStatusTimelineActor } from "../../types";
import { flattenCheckpointTimeline, type CheckpointTimelineDisplayEvent } from "./checkpointTimelineModel";

const TIMELINE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto"
});

function formatTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : TIMELINE_FORMATTER.format(timestamp);
}

function actorLabel(actor: WaferStatusTimelineActor) {
  return actor.name?.trim() || "System record";
}

const toneStyles: Record<CheckpointTimelineDisplayEvent["tone"], {
  marker: string;
  card: string;
  badge: string;
  glyph: string;
}> = {
  neutral: {
    marker: "border-[#aaa99f] bg-white text-[#5f5e56]",
    card: "border-[#e4e3dc] bg-white",
    badge: "bg-[#efefeb] text-[#65645c]",
    glyph: "•"
  },
  awaiting: {
    marker: "border-[#d99a24] bg-[#fff8e7] text-[#825b11]",
    card: "border-[#ead29b] bg-[#fffcf4]",
    badge: "bg-[#fff0c9] text-[#825b11]",
    glyph: "…"
  },
  approved: {
    marker: "border-[#4a9b5c] bg-[#edf8ef] text-[#2f6f3d]",
    card: "border-[#bcd8c2] bg-[#f8fcf8]",
    badge: "bg-[#e2f2e5] text-[#2f6f3d]",
    glyph: "✓"
  },
  redo: {
    marker: "border-[#c76359] bg-[#fff1f0] text-[#8e332c]",
    card: "border-[#e4b8b3] bg-[#fff9f8]",
    badge: "bg-[#fde4e1] text-[#8e332c]",
    glyph: "↶"
  }
};

function TimelineEvent({ event }: { event: CheckpointTimelineDisplayEvent }) {
  const style = toneStyles[event.tone];
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
      <span className={`relative z-10 mt-1 grid h-7 w-7 place-items-center rounded-full border text-[12px] font-bold ${style.marker}`} aria-hidden>
        {style.glyph}
      </span>
      <article className={`min-w-0 rounded-lg border p-3.5 ${style.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-[#20201c]">{event.title}</h3>
            {event.stepName ? <p className="mt-0.5 text-[12px] font-medium text-[#5f5e57]">{event.stepName}</p> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {event.inheritedFromParent ? (
              <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-bold text-[#4e626d]">
                From {event.inheritedFromParent.waferCode}
              </span>
            ) : null}
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${style.badge}`}>{formatTime(event.occurredAt)}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#77766e]">{actorLabel(event.actor)}</p>
        {event.note ? <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#54534c]">{event.note}</p> : null}
      </article>
    </li>
  );
}

export function CheckpointTimeline({ entries }: { entries: readonly WaferStatusCheckpointHistoryEntry[] }) {
  const events = flattenCheckpointTimeline(entries);
  if (!events.length) {
    return (
      <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-[#ddddda] bg-white px-6 text-center">
        <p className="max-w-sm text-[13px] font-medium leading-5 text-[#777770]">No process history has been recorded.</p>
      </div>
    );
  }

  return (
    <ol className="relative before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-[#deded8]" aria-label="Chronological process history">
      {events.map((event) => <TimelineEvent event={event} key={event.id} />)}
    </ol>
  );
}
