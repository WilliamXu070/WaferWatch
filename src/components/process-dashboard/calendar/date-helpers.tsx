import { CSSProperties, HTMLAttributes } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  DAY_MS,
  HOUR_MS,
  MIN_ZOOM_MS,
  SNAP_MS,
  START_HOUR
} from "./constants";
import type {
  CalendarPresentationMode,
  TimelineHeaderScale,
  WireframeHeaderScale
} from "./types";

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

export function buildDateAtMinute(date: Date, minute: number) {
  const next = new Date(date);
  next.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return next;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampVisibleWindow(
  requestedStart: number,
  requestedEnd: number,
  timelineStart: number,
  timelineEnd: number,
  maxSpanMs: number
) {
  const timelineSpan = timelineEnd - timelineStart;
  const maxSpan = clamp(maxSpanMs, MIN_ZOOM_MS, Math.max(1, timelineSpan));
  const minSpan = MIN_ZOOM_MS;

  const requestedSpan = requestedEnd - requestedStart;
  const span = clamp(requestedSpan, minSpan, maxSpan);
  const start = clamp(requestedStart, timelineStart, timelineEnd - span);
  const end = start + span;

  return { start, end };
}

export function snapTime(time: number) {
  return Math.round(time / SNAP_MS) * SNAP_MS;
}

export function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${displayHour}:${String(minute % 60).padStart(2, "0")} ${suffix}`;
}

export function formatDateTime(date: Date) {
  return `${date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  })} ${formatMinute(date.getHours() * 60 + date.getMinutes())}`;
}

export function formatWindow(startsAt: Date, endsAt: Date) {
  return `${formatDateTime(startsAt)} - ${formatMinute(endsAt.getHours() * 60 + endsAt.getMinutes())}`;
}

export function formatCompactDateTime(date: Date) {
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })} ${formatMinute(date.getHours() * 60 + date.getMinutes())}`;
}

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function getCurrentWeekStart(date: Date) {
  const input = dayjs(date);
  const weekday = input.day();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return input
    .add(mondayOffset, "day")
    .hour(START_HOUR)
    .minute(0)
    .second(0)
    .millisecond(0)
    .valueOf();
}

export function formatTimelineItemWindow(startsAt: Date, endsAt: Date, presentationMode: CalendarPresentationMode) {
  if (presentationMode !== "wireframe") {
    return formatWindow(startsAt, endsAt);
  }

  if (isSameCalendarDay(startsAt, endsAt)) {
    return `${formatMinute(startsAt.getHours() * 60 + startsAt.getMinutes())} - ${formatMinute(
      endsAt.getHours() * 60 + endsAt.getMinutes()
    )}`;
  }

  return `${formatCompactDateTime(startsAt)} - ${formatCompactDateTime(endsAt)}`;
}

function createHeaderLabelFormatter(format: string) {
  return ([start]: [Dayjs, Dayjs]) => start.format(format);
}

function formatSixHourBlock([start, end]: [Dayjs, Dayjs]) {
  const hour = start.hour();
  const label = hour < 6
    ? "Night"
    : hour < 12
      ? "Morning"
      : hour < 18
        ? "Afternoon"
        : "Evening";

  return `${label} ${start.format("h A")}-${end.format("h A")}`;
}

const HEADER_SCALES: Record<TimelineHeaderScale["id"], TimelineHeaderScale> = {
  minutes: {
    id: "minutes",
    primaryUnit: "day",
    primaryLabelFormat: createHeaderLabelFormatter("ddd, MMM D"),
    secondaryUnit: "minute",
    secondaryLabelFormat: createHeaderLabelFormatter("h:mm A"),
    hourStep: 1
  },
  hours: {
    id: "hours",
    primaryUnit: "day",
    primaryLabelFormat: createHeaderLabelFormatter("ddd, MMM D"),
    secondaryUnit: "hour",
    secondaryLabelFormat: createHeaderLabelFormatter("h A"),
    hourStep: 1
  },
  blocks: {
    id: "blocks",
    primaryUnit: "day",
    primaryLabelFormat: createHeaderLabelFormatter("ddd, MMM D"),
    secondaryUnit: "hour",
    secondaryLabelFormat: formatSixHourBlock,
    hourStep: 6
  },
  days: {
    id: "days",
    primaryUnit: "month",
    primaryLabelFormat: createHeaderLabelFormatter("MMM YYYY"),
    secondaryUnit: "day",
    secondaryLabelFormat: createHeaderLabelFormatter("ddd D"),
    hourStep: 6
  }
};

const WIREFRAME_HEADER_SCALES: Record<WireframeHeaderScale["id"], WireframeHeaderScale> = {
  days: {
    id: "days",
    unit: "day",
    labelFormat: createHeaderLabelFormatter("ddd D")
  },
  weeks: {
    id: "weeks",
    unit: "day",
    labelFormat: createHeaderLabelFormatter("MMM D")
  },
  months: {
    id: "months",
    unit: "month",
    labelFormat: createHeaderLabelFormatter("MMM YYYY")
  }
};

export function getHeaderScale(visibleSpan: number): TimelineHeaderScale {
  if (visibleSpan <= 4 * HOUR_MS) {
    return HEADER_SCALES.minutes;
  }

  if (visibleSpan <= 18 * HOUR_MS) {
    return HEADER_SCALES.hours;
  }

  if (visibleSpan <= 2 * DAY_MS) {
    return HEADER_SCALES.blocks;
  }

  return HEADER_SCALES.days;
}

export function getWireframeHeaderScale(visibleSpan: number): WireframeHeaderScale {
  if (visibleSpan <= 14 * DAY_MS) {
    return WIREFRAME_HEADER_SCALES.days;
  }

  if (visibleSpan <= 70 * DAY_MS) {
    return WIREFRAME_HEADER_SCALES.weeks;
  }

  return WIREFRAME_HEADER_SCALES.months;
}

export function isCurrentDay(timestamp: number) {
  return dayjs(timestamp).isSame(dayjs(), "day");
}

export function createCurrentDayHeaderRenderer(highlightDay: boolean) {
  if (!highlightDay) {
    return undefined;
  }

  return function CurrentDayHeaderRenderer({
    intervalContext,
    getIntervalProps
  }: {
    intervalContext: { intervalText: string; interval: { startTime: Dayjs } };
    getIntervalProps: (props?: { style?: CSSProperties }) => HTMLAttributes<HTMLElement>;
  }) {
    const intervalProps = getIntervalProps() as HTMLAttributes<HTMLElement> & {
      key?: string | number;
      className?: string;
    };
    const { key: intervalKey, className: intervalClassName, ...safeIntervalProps } = intervalProps;

    return (
      <div
        key={intervalKey}
        {...safeIntervalProps}
        className={[
          intervalClassName,
          "ww-timeline-date-header",
          isCurrentDay(intervalContext.interval.startTime.valueOf())
            ? "ww-timeline-date-header--today"
            : undefined
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {intervalContext.intervalText}
      </div>
    );
  };
}

export function createWireframeHeaderRenderer(scaleId: WireframeHeaderScale["id"]) {
  return function WireframeHeaderRenderer({
    intervalContext,
    getIntervalProps
  }: {
    intervalContext: { interval: { startTime: Dayjs } };
    getIntervalProps: (props?: { style?: CSSProperties }) => HTMLAttributes<HTMLElement>;
  }) {
    const intervalProps = getIntervalProps() as HTMLAttributes<HTMLElement> & {
      key?: string | number;
      className?: string;
    };
    const { key: intervalKey, className: intervalClassName, ...safeIntervalProps } = intervalProps;
    const startTime = intervalContext.interval.startTime;
    const isWeekAnchor = scaleId !== "weeks" || startTime.day() === 1;
    const shouldRenderLabel = scaleId !== "weeks" || isWeekAnchor;
    const primaryLabel =
      scaleId === "months"
        ? startTime.format("MMM")
        : scaleId === "weeks"
          ? startTime.format("MMM D")
          : startTime.format("ddd D");
    const secondaryLabel =
      scaleId === "months"
        ? startTime.format("YYYY")
        : scaleId === "weeks"
          ? "Week"
          : startTime.format("MMM D");

    return (
      <div
        key={intervalKey}
        {...safeIntervalProps}
        className={[
          intervalClassName,
          "ww-timeline-wireframe-header",
          `ww-timeline-wireframe-header--${scaleId}`,
          "ww-timeline-wireframe-day-header",
          shouldRenderLabel ? undefined : "ww-timeline-wireframe-header--empty",
          isCurrentDay(startTime.valueOf()) ? "ww-timeline-date-header--today" : undefined
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {shouldRenderLabel ? (
          <>
            <strong>{primaryLabel}</strong>
            <span>{secondaryLabel}</span>
          </>
        ) : null}
      </div>
    );
  };
}

export function getDayAndHour(timestamp: number) {
  const value = dayjs(timestamp);
  return {
    day: value.day(),
    hour: value.hour()
  };
}
