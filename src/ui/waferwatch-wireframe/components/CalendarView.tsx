"use client";

import { useMemo, useState } from "react";
import { ProcessCalendarBoard } from "@/components/process-dashboard/ProcessCalendarBoard";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import type {
  CalendarEventModel,
  CalendarPersonModel
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WINDOW_DAYS = 365;
const LOOKBACK_DAYS = 180;
const LOOKAHEAD_DAYS = 180;
const CALENDAR_TITLE = "Calendar";

type ProcessStepOption = {
  id: string;
  name: string;
};

type CalendarProcess = {
  id: string;
  name: string;
  version: string;
};

type CalendarViewProps = {
  result:
    | {
        status: "ready";
        data: {
          process: CalendarProcess;
          steps: readonly ProcessStepOption[];
          wafers: readonly { id: string; wafer_code: string }[];
          people: readonly CalendarPersonModel[];
          initialEvents: readonly CalendarEventModel[];
          initialStartDate: string;
        };
      }
    | { status: "unauthenticated" }
    | { status: "no-process" }
    | { status: "unavailable"; message: string };
};

function parseIsoDate(input: string) {
  const parsed = new Date(`${input}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function toIsoDate(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDateDays(input: string, days: number) {
  const date = parseIsoDate(input);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function formatRangeLabel(input: string) {
  const start = parseIsoDate(input);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })} - ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })}`;
}

function getCalendarWindowFallback(startDate: Date, eventStart: number, eventEnd: number) {
  const windowStart = new Date(eventStart);
  const windowEnd = new Date(eventEnd);
  windowStart.setDate(windowStart.getDate() - LOOKBACK_DAYS);
  windowEnd.setDate(windowEnd.getDate() + LOOKAHEAD_DAYS);

  if (windowStart.getTime() >= windowEnd.getTime()) {
    windowStart.setDate(startDate.getDate() - LOOKBACK_DAYS);
    windowEnd.setDate(startDate.getDate() + LOOKAHEAD_DAYS);
  }

  const days = Math.max(
    MIN_WINDOW_DAYS,
    Math.max(1, Math.ceil((windowEnd.getTime() - windowStart.getTime()) / DAY_MS))
  );

  return {
    startDate: toIsoDate(windowStart),
    days
  };
}

function getCalendarWindow(
  initialStartDate: string,
  events: readonly CalendarEventModel[]
) {
  const fallbackStart = parseIsoDate(initialStartDate);

  if (!events?.length) {
    return {
      startDate: toIsoDate(new Date(fallbackStart.getTime() - LOOKBACK_DAYS * DAY_MS)),
      days: MIN_WINDOW_DAYS + LOOKBACK_DAYS + LOOKAHEAD_DAYS
    };
  }

  const starts = events
    .map((event) => new Date(event.starts_at).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));
  const ends = events
    .map((event) => new Date(event.ends_at).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (!starts.length || !ends.length) {
    return {
      startDate: toIsoDate(new Date(fallbackStart.getTime() - LOOKBACK_DAYS * DAY_MS)),
      days: MIN_WINDOW_DAYS + LOOKBACK_DAYS + LOOKAHEAD_DAYS
    };
  }

  return getCalendarWindowFallback(
    fallbackStart,
    Math.min(...starts),
    Math.max(...ends)
  );
}

function getDisabledStateCopy(status: Exclude<CalendarViewProps["result"], { status: "ready" }>) {
  if (status.status === "unauthenticated") {
    return {
      title: "Calendar preview disabled",
      description: "Sign in with an existing account to load canonical Supabase calendar data."
    };
  }

  if (status.status === "no-process") {
    return {
      title: "No process template available",
      description: "Create or seed a process template before scheduling calendar events."
    };
  }

  return {
    title: "Calendar backend unavailable",
    description: status.message
  };
}

export function CalendarView({ result }: CalendarViewProps) {
  const isBackendReady = result.status === "ready";
  const calendarData = isBackendReady ? result.data : null;
  const [visibleStartDate, setVisibleStartDate] = useState(() =>
    calendarData?.initialStartDate ?? toIsoDate(new Date())
  );
  const resolvedSteps = useMemo(() => (calendarData ? [...calendarData.steps] : []), [calendarData]);
  const resolvedWafers = useMemo(() => (calendarData ? [...calendarData.wafers] : []), [calendarData]);
  const resolvedPeople = useMemo(() => (calendarData ? [...calendarData.people] : []), [calendarData]);
  const resolvedEvents = useMemo(() => (calendarData ? [...calendarData.initialEvents] : []), [calendarData]);

  const calendarWindowRange = useMemo(
    () =>
      calendarData
        ? getCalendarWindow(calendarData.initialStartDate, resolvedEvents)
        : null,
    [calendarData, resolvedEvents]
  );
  const disabledState = isBackendReady ? null : getDisabledStateCopy(result);
  const rangeLabel = calendarData ? formatRangeLabel(visibleStartDate) : "Backend schedule";

  return (
    <div className="wireframe-calendar-view flex flex-col gap-5 p-2 md:p-6">
      <section className="wireframe-calendar-card rounded-2xl border border-[#e5e5db] bg-white md:rounded-3xl">
        <header className="wireframe-calendar-card__header">
          <div>
            <h1 className="text-xl font-semibold text-[#151512]">{CALENDAR_TITLE}</h1>
            <p className="mt-1 text-sm text-[#8a887b]">
              {calendarData
                ? `${calendarData.process.name} ${calendarData.process.version ? `(${calendarData.process.version})` : ""}`
                : "Canonical backend data only. Demo persistence is disabled."}
            </p>
          </div>

          <div className="wireframe-calendar-card__controls" aria-label="Calendar display controls">
            <div className="wireframe-calendar-card__range" aria-label="Current range">
              <button
                type="button"
                aria-label="Previous week"
                disabled={!calendarData}
                onClick={() => setVisibleStartDate((current) => addDateDays(current, -7))}
              >
                <ChevronLeftIcon />
              </button>
              <span>{rangeLabel}</span>
              <button
                type="button"
                aria-label="Next week"
                disabled={!calendarData}
                onClick={() => setVisibleStartDate((current) => addDateDays(current, 7))}
              >
                <ChevronRightIcon />
              </button>
            </div>

            <button
              type="button"
              className="wireframe-calendar-card__today"
              disabled={!calendarData}
              onClick={() => setVisibleStartDate(toIsoDate(new Date()))}
            >
              Today
            </button>
          </div>
        </header>

        <div className="wireframe-calendar-surface">
          {calendarData && calendarWindowRange ? (
            <>
              {resolvedEvents.length === 0 ? (
                <div className="mb-4 rounded-2xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] p-4">
                  <p className="text-sm font-semibold text-[#151512]">No calendar events yet</p>
                  <p className="mt-1 text-sm text-[#7b796f]">
                    This process has no Supabase calendar rows in the loaded range. Double-click the scheduler to create the first event.
                  </p>
                </div>
              ) : null}

              <ProcessCalendarBoard
                key={`${calendarData.process.id}:${visibleStartDate}`}
                processTemplateId={calendarData.process.id}
                calendarStartDate={calendarWindowRange.startDate}
                days={calendarWindowRange.days}
                steps={resolvedSteps}
                wafers={resolvedWafers}
                people={resolvedPeople}
                initialEvents={resolvedEvents}
                initialVisibleStartDate={visibleStartDate}
                presentationMode="wireframe"
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] p-6">
              <p className="text-sm font-semibold text-[#151512]">{disabledState?.title}</p>
              <p className="mt-2 max-w-2xl text-sm text-[#7b796f]">{disabledState?.description}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
