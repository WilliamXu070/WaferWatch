"use client";

import { useEffect, useMemo, useState } from "react";
import { ProcessCalendarBoard } from "@/components/process-dashboard/ProcessCalendarBoard";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import type {
  CalendarEventModel,
  CalendarPersonModel
} from "../types";
import { setProcessWorkspaceCalendarWeek } from "@/features/workspace/store";
import type { Json } from "@/types/database";

const WEEK_DAYS = 7;
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
          wafers: readonly {
            id: string;
            wafer_code: string;
            die_label?: string | null;
            current_step_name?: string | null;
            current_handler_name?: string | null;
          }[];
          people: readonly CalendarPersonModel[];
          initialEvents: readonly CalendarEventModel[];
          cachedWeeks?: readonly {
            startDate: string;
            events: readonly CalendarEventModel[];
          }[];
          initialStartDate: string;
          canEdit: boolean;
          workspaceBacked?: boolean;
          workspaceRevision?: number;
        };
      }
    | { status: "unauthenticated" }
    | { status: "no-process" }
    | { status: "unavailable"; message: string };
};

type CalendarWindow = {
  events: readonly CalendarEventModel[];
  people: readonly CalendarPersonModel[];
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
  end.setDate(start.getDate() + WEEK_DAYS - 1);

  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })} - ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })}`;
}

function getWindowCacheKey(processId: string, startDate: string) {
  return `${processId}:${startDate}`;
}

function getWeekRequestRange(startDate: string) {
  const endDate = addDateDays(startDate, WEEK_DAYS);
  const toUtcBoundary = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
  };

  return {
    from: toUtcBoundary(startDate),
    to: toUtcBoundary(endDate)
  };
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
  const [windowsByKey, setWindowsByKey] = useState<Record<string, CalendarWindow>>(() =>
    calendarData ? Object.fromEntries((calendarData.cachedWeeks ?? []).map((week) => [
      getWindowCacheKey(calendarData.process.id, week.startDate),
      { events: week.events, people: calendarData.people }
    ])) : {}
  );
  const [preloadDirection, setPreloadDirection] = useState<-1 | 0 | 1>(0);
  const resolvedSteps = useMemo(() => (calendarData ? [...calendarData.steps] : []), [calendarData]);
  const resolvedWafers = useMemo(() => (calendarData ? [...calendarData.wafers] : []), [calendarData]);
  const windowKey = calendarData
    ? getWindowCacheKey(calendarData.process.id, visibleStartDate)
    : null;
  const serverWindowKey = calendarData
    ? getWindowCacheKey(calendarData.process.id, calendarData.initialStartDate)
    : null;
  const serverWindow = calendarData
    ? { events: calendarData.initialEvents, people: calendarData.people }
    : null;
  const workspaceWindowsByKey = useMemo(() => calendarData
    ? Object.fromEntries((calendarData.cachedWeeks ?? []).map((week) => [
        getWindowCacheKey(calendarData.process.id, week.startDate),
        { events: week.events, people: calendarData.people }
      ]))
    : {}, [calendarData]);
  const activeWindow = windowKey && windowKey === serverWindowKey
    ? serverWindow
    : windowKey
      ? workspaceWindowsByKey[windowKey] ?? windowsByKey[windowKey] ?? null
      : null;
  const resolvedPeople = useMemo(
    () => (activeWindow ? [...activeWindow.people] : calendarData ? [...calendarData.people] : []),
    [activeWindow, calendarData]
  );
  const resolvedEvents = useMemo(
    () => (activeWindow ? [...activeWindow.events] : []),
    [activeWindow]
  );

  useEffect(() => {
    if (!calendarData || !windowKey || activeWindow) return;

    const controller = new AbortController();
    const range = getWeekRequestRange(visibleStartDate);
    const query = new URLSearchParams({
      ...range,
      ...(calendarData.workspaceBacked ? { includePeople: "0" } : {})
    });

    void fetch(`/api/processes/${calendarData.process.id}/calendar?${query.toString()}`, {
      signal: controller.signal,
      credentials: "same-origin"
    }).then(async (response) => {
      if (!response.ok) return;
      const schedule = await response.json() as CalendarWindow;
      if (controller.signal.aborted) return;
      setWindowsByKey((current) => Object.fromEntries([
        ...Object.entries(current).filter(([key]) => key !== windowKey).slice(-7),
        [windowKey, schedule]
      ]));
      if (calendarData.workspaceBacked) {
        setProcessWorkspaceCalendarWeek(calendarData.process.id, {
          from: range.from,
          to: range.to,
          rows: [...schedule.events] as unknown as Json[]
        });
      }
    }).catch(() => {
      // Keep the calendar interactive; a future visit to this week can retry.
    });

    return () => controller.abort();
  }, [activeWindow, calendarData, visibleStartDate, windowKey]);

  useEffect(() => {
    if (!calendarData?.workspaceBacked || !activeWindow || preloadDirection === 0) return;
    const adjacentStartDate = addDateDays(visibleStartDate, preloadDirection * WEEK_DAYS);
    const adjacentKey = getWindowCacheKey(calendarData.process.id, adjacentStartDate);
    if (workspaceWindowsByKey[adjacentKey] || windowsByKey[adjacentKey]) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const range = getWeekRequestRange(adjacentStartDate);
      const query = new URLSearchParams({ ...range, includePeople: "0" });
      void fetch(`/api/processes/${calendarData.process.id}/calendar?${query}`, {
        signal: controller.signal,
        credentials: "same-origin"
      }).then(async (response) => {
        if (!response.ok) return;
        const schedule = await response.json() as CalendarWindow;
        if (controller.signal.aborted) return;
        setWindowsByKey((current) => Object.fromEntries([
          ...Object.entries(current).filter(([key]) => key !== adjacentKey).slice(-7),
          [adjacentKey, schedule]
        ]));
        setProcessWorkspaceCalendarWeek(calendarData.process.id, {
          from: range.from,
          to: range.to,
          rows: [...schedule.events] as unknown as Json[]
        });
      }).catch(() => undefined);
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeWindow, calendarData, preloadDirection, visibleStartDate, windowsByKey, workspaceWindowsByKey]);

  const disabledState = isBackendReady ? null : getDisabledStateCopy(result);
  const rangeLabel = calendarData ? formatRangeLabel(visibleStartDate) : "Backend schedule";

  return (
    <div
      className="wireframe-calendar-view flex flex-col gap-5 p-2 md:p-6"
      data-workspace-revision={calendarData?.workspaceRevision}
    >
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
                onClick={() => {
                  setPreloadDirection(-1);
                  setVisibleStartDate((current) => addDateDays(current, -7));
                }}
              >
                <ChevronLeftIcon />
              </button>
              <span>{rangeLabel}</span>
              <button
                type="button"
                aria-label="Next week"
                disabled={!calendarData}
                onClick={() => {
                  setPreloadDirection(1);
                  setVisibleStartDate((current) => addDateDays(current, 7));
                }}
              >
                <ChevronRightIcon />
              </button>
            </div>

            <button
              type="button"
              className="wireframe-calendar-card__today"
              disabled={!calendarData}
              onClick={() => {
                setPreloadDirection(0);
                setVisibleStartDate(toIsoDate(new Date()));
              }}
            >
              Today
            </button>
          </div>
        </header>

        <div className="wireframe-calendar-surface">
          {calendarData ? (
            <>
              <ProcessCalendarBoard
                key={`${calendarData.process.id}:${visibleStartDate}`}
                processTemplateId={calendarData.process.id}
                calendarStartDate={visibleStartDate}
                days={WEEK_DAYS}
                steps={resolvedSteps}
                wafers={resolvedWafers}
                people={resolvedPeople}
                initialEvents={resolvedEvents}
                initialVisibleStartDate={visibleStartDate}
                canEdit={calendarData.canEdit}
                workspaceBacked={calendarData.workspaceBacked}
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
