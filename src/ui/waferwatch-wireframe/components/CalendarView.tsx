"use client";

import { useMemo } from "react";
import { ProcessCalendarBoard } from "@/components/process-dashboard/ProcessCalendarBoard";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { calendarModel, calendarWindow, flowModel, processSummary } from "../mock-data";
import { UpcomingHandoffs } from "./UpcomingHandoffs";
import type {
  CalendarEventModel,
  CalendarPersonModel
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WINDOW_DAYS = 365;
const LOOKBACK_DAYS = 180;
const LOOKAHEAD_DAYS = 180;

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
  backendEnabled?: boolean;
  process?: CalendarProcess;
  steps?: readonly ProcessStepOption[];
  people?: readonly CalendarPersonModel[];
  initialEvents?: readonly CalendarEventModel[];
  initialStartDate?: string;
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

export function CalendarView({
  backendEnabled = false,
  process = processSummary,
  steps,
  people,
  initialEvents,
  initialStartDate = calendarWindow.startDate
}: CalendarViewProps) {
  const resolvedProcess = process;
  const resolvedSteps = useMemo(
    () =>
      steps && steps.length
        ? [...steps]
        : flowModel.steps.map((step) => ({
            id: step.id,
            name: step.name
          })),
    [steps]
  );
  const resolvedPeople = useMemo(
    () => (people && people.length ? [...people] : [...calendarModel.people]),
    [people]
  );
  const resolvedEvents = useMemo(
    () => (initialEvents && initialEvents.length ? [...initialEvents] : [...calendarModel.events]),
    [initialEvents]
  );

  const calendarWindowRange = useMemo(
    () => getCalendarWindow(initialStartDate, resolvedEvents),
    [initialStartDate, resolvedEvents]
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="wireframe-calendar-card rounded-3xl border border-[#e5e5db] bg-white">
        <header className="wireframe-calendar-card__header">
          <div>
            <h1 className="text-xl font-semibold text-[#151512]">{calendarModel.title}</h1>
            <p className="mt-1 text-sm text-[#8a887b]">
              {backendEnabled
                ? `${resolvedProcess.name} ${resolvedProcess.version ? `(${resolvedProcess.version})` : ""}`
                : calendarModel.subtitle}
            </p>
          </div>

          <div className="wireframe-calendar-card__controls" aria-label="Calendar display controls">
            <div className="wireframe-calendar-card__range" aria-label="Current range">
              <button type="button" aria-label="Previous range">
                <ChevronLeftIcon />
              </button>
              <span>{calendarModel.rangeLabel}</span>
              <button type="button" aria-label="Next range">
                <ChevronRightIcon />
              </button>
            </div>

            <button type="button" className="wireframe-calendar-card__today">
              Today
            </button>
          </div>
        </header>

        <div className="wireframe-calendar-surface">
          <ProcessCalendarBoard
            processTemplateId={resolvedProcess.id}
            calendarStartDate={calendarWindowRange.startDate}
            days={calendarWindowRange.days}
            steps={resolvedSteps}
            people={resolvedPeople}
            initialEvents={resolvedEvents}
            initialVisibleStartDate={initialStartDate}
            persistenceMode={backendEnabled ? "server" : "local"}
            presentationMode="wireframe"
          />
        </div>
      </section>

      <UpcomingHandoffs handoffs={calendarModel.handoffs} />
    </div>
  );
}
