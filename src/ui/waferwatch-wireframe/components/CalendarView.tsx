"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createProcessCalendarEvent,
  deleteProcessCalendarEvent,
  moveProcessCalendarEvent
} from "@/features/calendar/actions";
import type { ProcessCalendarLocation } from "@/features/calendar/queries";
import type { CalendarEventModel, CalendarPersonModel, CalendarSiteModel } from "../types";
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, TowerIcon, UserIcon } from "../icons";
import { calendarModel, calendarWindow, flowModel, processSummary } from "../mock-data";
import { UpcomingHandoffs } from "./UpcomingHandoffs";

const rangeModes = ["Day", "Week", "Month"] as const;
type RangeMode = (typeof rangeModes)[number];
type ActionMode = "step" | "manual";
type EventTone = "amber" | "blue" | "green";
type ResizeEdge = "left" | "right";

type ProcessStepOption = {
  id: string;
  name: string;
};

type CalendarProcess = {
  id: string;
  name: string;
  version: string;
};

type WeekDay = {
  key: string;
  label: string;
  sublabel: string;
  isWeekend: boolean;
};

type DraftEvent = {
  location: ProcessCalendarLocation;
  startsAt: Date;
  endsAt: Date;
};

type DragState =
  | {
      type: "move";
      eventId: string;
      originalEvent: CalendarEventModel;
      pointerOffsetMs: number;
      durationMs: number;
    }
  | {
      type: "resize";
      eventId: string;
      edge: ResizeEdge;
      originalEvent: CalendarEventModel;
    }
  | {
      type: "create";
      anchorTime: number;
      location: ProcessCalendarLocation;
    };

type CalendarViewProps = {
  backendEnabled?: boolean;
  process?: CalendarProcess;
  steps?: readonly ProcessStepOption[];
  people?: readonly CalendarPersonModel[];
  initialEvents?: readonly CalendarEventModel[];
  initialStartDate?: string;
};

const WIRE_TIME_ZONE = "America/Toronto";
const MIN_SHORT_EVENT_SPAN_DAYS = 0.98;
const MIN_EVENT_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_MS = 60 * 60 * 1000;
const SNAP_MS = 15 * 60 * 1000;
const MODE_DAY_COUNT: Record<RangeMode, number> = {
  Day: 1,
  Week: 7,
  Month: 30
};

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: WIRE_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);

  return `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`;
}

function dateFromKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMondayWeekStart(date: Date) {
  const next = startOfLocalDay(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

function snapTime(time: number) {
  return Math.round(time / SNAP_MS) * SNAP_MS;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildWeekDays(startDate: string, days: number): WeekDay[] {
  const start = new Date(`${startDate}T12:00:00.000Z`);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);

    const dayParts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone: WIRE_TIME_ZONE,
      weekday: "short"
    }).formatToParts(date);
    const dateParts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      timeZone: WIRE_TIME_ZONE
    }).formatToParts(date);
    const weekday = getPart(dayParts, "weekday");

    return {
      key: formatDateKey(date),
      label: `${weekday} ${getPart(dayParts, "day")}`,
      sublabel: `${getPart(dateParts, "month")} ${getPart(dateParts, "day")}`,
      isWeekend: weekday === "Sat" || weekday === "Sun"
    };
  });
}

function getZonedMinuteOfDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: WIRE_TIME_ZONE
  }).formatToParts(date);

  return Number(getPart(parts, "hour")) * 60 + Number(getPart(parts, "minute"));
}

function getVisibleOffset(date: Date, weekDays: WeekDay[]) {
  const dayIndex = weekDays.findIndex((day) => day.key === formatDateKey(date));
  if (dayIndex === -1) {
    return date.getTime() < dateFromKey(weekDays[0]?.key ?? formatDateKey(new Date())).getTime()
      ? 0
      : weekDays.length;
  }

  return dayIndex + getZonedMinuteOfDay(date) / 1440;
}

function offsetToDate(offset: number, weekDays: WeekDay[]) {
  const safeOffset = clamp(offset, 0, Math.max(0, weekDays.length - 1 / 1440));
  const dayIndex = clamp(Math.floor(safeOffset), 0, Math.max(0, weekDays.length - 1));
  const minute = Math.round((safeOffset - dayIndex) * 1440);
  const date = dateFromKey(weekDays[dayIndex].key);
  date.setMinutes(minute, 0, 0);
  return date;
}

function formatTimeRange(startsAtInput: string | Date, endsAtInput: string | Date) {
  const startsAt = new Date(startsAtInput);
  const endsAt = new Date(endsAtInput);
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: WIRE_TIME_ZONE
  });

  if (formatDateKey(startsAt) === formatDateKey(endsAt)) {
    return `${timeFormatter.format(startsAt)} - ${timeFormatter.format(endsAt)}`;
  }

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: WIRE_TIME_ZONE
  });

  return `${dateFormatter.format(startsAt)} ${timeFormatter.format(startsAt)} - ${dateFormatter.format(
    endsAt
  )} ${timeFormatter.format(endsAt)}`;
}

function formatRangeLabel(weekDays: WeekDay[]) {
  const first = dateFromKey(weekDays[0].key);
  const last = dateFromKey(weekDays[weekDays.length - 1].key);
  const sameMonth = first.getMonth() === last.getMonth();
  const sameYear = first.getFullYear() === last.getFullYear();
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

  if (weekDays.length === 1) {
    return `${weekDays[0].label}, ${weekDays[0].sublabel}`;
  }

  if (sameMonth && sameYear) {
    return `${monthFormatter.format(first)} ${first.getDate()} - ${last.getDate()}`;
  }

  return `${monthFormatter.format(first)} ${first.getDate()} - ${monthFormatter.format(last)} ${last.getDate()}`;
}

function toDisplayName(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getEventTitle(event: CalendarEventModel, stepsById: Map<string, string>) {
  if (event.process_template_id === processSummary.id && event.id === "evt-intake") return "New event";
  if (event.manual_action) return event.manual_action;
  if (event.process_step_id) return stepsById.get(event.process_step_id) ?? "Process event";
  return "New event";
}

function isMockDraftEvent(event: CalendarEventModel) {
  return event.process_template_id === processSummary.id && event.id === "evt-intake";
}

function getEventTone(event: CalendarEventModel, stepsById: Map<string, string>): EventTone {
  const normalized = getEventTitle(event, stepsById).toLowerCase();
  if (normalized.includes("lith") || normalized.includes("coat") || normalized.includes("expose")) return "blue";
  if (normalized.includes("clean") || normalized.includes("pol")) return "green";
  return "amber";
}

function getEventStyle(event: CalendarEventModel, weekDays: WeekDay[]): CSSProperties {
  const startOffset = clamp(getVisibleOffset(new Date(event.starts_at), weekDays), 0, weekDays.length);
  const endOffset = clamp(getVisibleOffset(new Date(event.ends_at), weekDays), 0, weekDays.length);
  const naturalSpan = Math.max(0.18, endOffset - startOffset);
  const minimumSpan = Math.max(naturalSpan, MIN_SHORT_EVENT_SPAN_DAYS);
  const safeEndOffset = clamp(startOffset + minimumSpan, startOffset + 0.18, weekDays.length);

  return {
    left: `${(startOffset / weekDays.length) * 100}%`,
    top: "24px",
    width: `${((safeEndOffset - startOffset) / weekDays.length) * 100}%`
  };
}

function getDraftStyle(draft: DraftEvent, weekDays: WeekDay[]): CSSProperties {
  const startOffset = clamp(getVisibleOffset(draft.startsAt, weekDays), 0, weekDays.length);
  const endOffset = clamp(getVisibleOffset(draft.endsAt, weekDays), 0, weekDays.length);
  const safeEndOffset = Math.max(endOffset, startOffset + 0.18);

  return {
    left: `${(startOffset / weekDays.length) * 100}%`,
    top: "24px",
    width: `${((safeEndOffset - startOffset) / weekDays.length) * 100}%`
  };
}

function SiteIcon({ site }: { site: CalendarSiteModel }) {
  if (site.id === "Toronto") {
    return <TowerIcon />;
  }

  return <BuildingIcon />;
}

export function CalendarView({
  backendEnabled = false,
  process = processSummary,
  steps = flowModel.steps.map((step) => ({ id: step.id, name: step.name })),
  people = calendarModel.people,
  initialEvents = calendarModel.events,
  initialStartDate = calendarWindow.startDate
}: CalendarViewProps) {
  const [mode, setMode] = useState<RangeMode>("Week");
  const [visibleStart, setVisibleStart] = useState(() => dateFromKey(initialStartDate));
  const [events, setEvents] = useState<CalendarEventModel[]>([...initialEvents]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEvents[0]?.id ?? null);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(steps.length ? "step" : "manual");
  const [selectedStepId, setSelectedStepId] = useState(steps[0]?.id ?? "");
  const [manualAction, setManualAction] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(people[0] ? [people[0].id] : []);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const eventsRef = useRef<CalendarEventModel[]>([...initialEvents]);

  const visibleDayCount = MODE_DAY_COUNT[mode];
  const weekDays = useMemo(
    () => buildWeekDays(formatDateKey(visibleStart), visibleDayCount),
    [visibleDayCount, visibleStart]
  );
  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step.name])), [steps]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const visibleEvents = events.filter((event) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    const rangeStart = dateFromKey(weekDays[0].key);
    const rangeEnd = addDays(dateFromKey(weekDays[weekDays.length - 1].key), 1);
    return startsAt < rangeEnd && endsAt > rangeStart;
  });
  const rangeLabel = formatRangeLabel(weekDays);
  const canWrite = backendEnabled && process.id !== processSummary.id;

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const openDraft = useCallback((nextDraft: DraftEvent) => {
    setDraft(nextDraft);
    setSelectedEventId(null);
    setError(null);
    setActionMode(steps.length ? "step" : "manual");
    setSelectedStepId(steps[0]?.id ?? "");
    setManualAction("");
    setSelectedPersonIds(people[0] ? [people[0].id] : []);
    setDescription("");
  }, [people, steps]);

  const getPointerTarget = useCallback((event: PointerEvent | ReactPointerEvent) => {
    const board = boardRef.current;
    if (!board) return null;

    const tracks = Array.from(board.querySelectorAll<HTMLElement>("[data-calendar-site-track]"));
    const track =
      tracks.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      }) ?? (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-calendar-site-track]") : null);

    if (!track) return null;

    const rect = track.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const location = track.dataset.location as ProcessCalendarLocation | undefined;
    if (!location) return null;

    return {
      location,
      time: snapTime(offsetToDate(ratio * weekDays.length, weekDays).getTime())
    };
  }, [weekDays]);

  const updateDraftFromSelection = useCallback((anchorTime: number, location: ProcessCalendarLocation, currentTime: number) => {
    const startsAt = new Date(Math.min(anchorTime, currentTime));
    const endsAt = new Date(Math.max(currentTime, anchorTime + MIN_EVENT_MS));

    setDraft({
      location,
      startsAt,
      endsAt: endsAt.getTime() - startsAt.getTime() < MIN_EVENT_MS
        ? new Date(startsAt.getTime() + MIN_EVENT_MS)
        : endsAt
    });
  }, []);

  const handleEventPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    calendarEvent: CalendarEventModel,
    resizeEdge?: ResizeEdge
  ) => {
    if (!canWrite) {
      setSelectedEventId(calendarEvent.id);
      setDraft(null);
      return;
    }

    const pointerTarget = getPointerTarget(event);
    if (!pointerTarget) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedEventId(calendarEvent.id);
    setDraft(null);

    const nextDragState: DragState = resizeEdge
      ? {
          type: "resize",
          eventId: calendarEvent.id,
          edge: resizeEdge,
          originalEvent: calendarEvent
        }
      : {
          type: "move",
          eventId: calendarEvent.id,
          originalEvent: calendarEvent,
          pointerOffsetMs: pointerTarget.time - new Date(calendarEvent.starts_at).getTime(),
          durationMs: new Date(calendarEvent.ends_at).getTime() - new Date(calendarEvent.starts_at).getTime()
        };

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest(".wireframe-calendar-event")) {
      return;
    }

    const pointerTarget = getPointerTarget(event);
    if (!pointerTarget) return;

    if (canWrite && event.shiftKey) {
      event.preventDefault();
      const nextDragState: DragState = {
        type: "create",
        anchorTime: pointerTarget.time,
        location: pointerTarget.location
      };
      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
      updateDraftFromSelection(pointerTarget.time, pointerTarget.location, pointerTarget.time + MIN_EVENT_MS);
      return;
    }

    setSelectedEventId(null);
    setDraft(null);
  };

  const handleTrackDoubleClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canWrite || (event.target instanceof HTMLElement && event.target.closest(".wireframe-calendar-event"))) {
      return;
    }

    const pointerTarget = getPointerTarget(event);
    if (!pointerTarget) return;

    openDraft({
      location: pointerTarget.location,
      startsAt: new Date(pointerTarget.time),
      endsAt: new Date(pointerTarget.time + DEFAULT_EVENT_MS)
    });
  };

  const commitMove = useCallback((eventId: string, previousEvent: CalendarEventModel, nextEvent: CalendarEventModel) => {
    if (
      previousEvent.location === nextEvent.location &&
      previousEvent.starts_at === nextEvent.starts_at &&
      previousEvent.ends_at === nextEvent.ends_at
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await moveProcessCalendarEvent({
        eventId,
        location: nextEvent.location,
        startsAt: nextEvent.starts_at,
        endsAt: nextEvent.ends_at
      });

      if (!result.ok) {
        setEvents((current) => current.map((event) => (event.id === eventId ? previousEvent : event)));
        setError(result.error);
        return;
      }

      setEvents((current) => current.map((event) => (event.id === eventId ? result.data as CalendarEventModel : event)));
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const board = boardRef.current;
    board?.classList.add("wireframe-calendar-week--dragging");

    const handlePointerMove = (event: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag) return;

      const pointerTarget = getPointerTarget(event);
      if (!pointerTarget) return;

      event.preventDefault();

      if (currentDrag.type === "create") {
        updateDraftFromSelection(currentDrag.anchorTime, pointerTarget.location, pointerTarget.time);
        return;
      }

      const nextEvents = eventsRef.current.map((calendarEvent) => {
        if (calendarEvent.id !== currentDrag.eventId) return calendarEvent;

        if (currentDrag.type === "move") {
            const startsAt = new Date(pointerTarget.time - currentDrag.pointerOffsetMs);
            const endsAt = new Date(startsAt.getTime() + currentDrag.durationMs);

            return {
              ...calendarEvent,
              location: pointerTarget.location,
              starts_at: new Date(snapTime(startsAt.getTime())).toISOString(),
              ends_at: new Date(snapTime(endsAt.getTime())).toISOString()
            };
          }

          const originalStart = new Date(calendarEvent.starts_at).getTime();
          const originalEnd = new Date(calendarEvent.ends_at).getTime();
          const resizedStart = currentDrag.edge === "left" ? pointerTarget.time : originalStart;
          const resizedEnd = currentDrag.edge === "right" ? pointerTarget.time : originalEnd;

          if (resizedEnd - resizedStart < MIN_EVENT_MS) return calendarEvent;

          return {
            ...calendarEvent,
          starts_at: new Date(resizedStart).toISOString(),
          ends_at: new Date(resizedEnd).toISOString()
        };
      });

      eventsRef.current = nextEvents;
      setEvents(nextEvents);
    };

    const handlePointerUp = () => {
      const currentDrag = dragStateRef.current;
      dragStateRef.current = null;
      setDragState(null);

      if (!currentDrag || currentDrag.type === "create") {
        return;
      }

      const nextEvent = eventsRef.current.find((event) => event.id === currentDrag.eventId);
      if (nextEvent) {
        commitMove(currentDrag.eventId, currentDrag.originalEvent, nextEvent);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      board?.classList.remove("wireframe-calendar-week--dragging");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [commitMove, dragState, getPointerTarget, updateDraftFromSelection]);

  const saveDraft = () => {
    if (!draft || !canWrite) return;

    setError(null);
    startTransition(async () => {
      const result = await createProcessCalendarEvent({
        processTemplateId: process.id,
        location: draft.location,
        startsAt: draft.startsAt.toISOString(),
        endsAt: draft.endsAt.toISOString(),
        processStepId: actionMode === "step" ? selectedStepId : null,
        manualAction: actionMode === "manual" ? manualAction : null,
        description,
        personIds: selectedPersonIds
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const createdEvent = result.data as CalendarEventModel;
      setEvents((current) => [...current, createdEvent].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setSelectedEventId(createdEvent.id);
      setDraft(null);
    });
  };

  const deleteSelectedEvent = () => {
    if (!selectedEvent || !canWrite) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteProcessCalendarEvent({ eventId: selectedEvent.id });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      setSelectedEventId(null);
    });
  };

  const handleModeChange = (nextMode: RangeMode) => {
    setMode(nextMode);
    setVisibleStart((current) => {
      if (nextMode === "Week") return getMondayWeekStart(current);
      if (nextMode === "Month") {
        const monthStart = startOfLocalDay(current);
        monthStart.setDate(1);
        return monthStart;
      }
      return startOfLocalDay(current);
    });
  };

  const shiftRange = (direction: -1 | 1) => {
    setVisibleStart((current) => addDays(current, direction * MODE_DAY_COUNT[mode]));
  };

  const jumpToday = () => {
    const today = new Date();
    if (mode === "Week") {
      setVisibleStart(getMondayWeekStart(today));
    } else if (mode === "Month") {
      const monthStart = startOfLocalDay(today);
      monthStart.setDate(1);
      setVisibleStart(monthStart);
    } else {
      setVisibleStart(startOfLocalDay(today));
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;

    event.preventDefault();
    if (event.deltaY < 0) {
      handleModeChange(mode === "Month" ? "Week" : "Day");
    } else {
      handleModeChange(mode === "Day" ? "Week" : "Month");
    }
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="wireframe-calendar-card rounded-2xl border border-ww-border bg-white">
        <header className="wireframe-calendar-card__header flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ww-ink">{calendarModel.title}</h1>
            <p className="mt-1 text-sm text-[#8a887f]">
              {backendEnabled
                ? `${process.name} ${process.version ? `(${process.version})` : ""}`
                : calendarModel.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-ww-border bg-[#fafaf7] p-1">
              {rangeModes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleModeChange(item)}
                  aria-pressed={mode === item}
                  className={[
                    "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                    mode === item ? "bg-ww-ink text-white" : "text-[#5f5d57] hover:text-ww-ink"
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-ww-border bg-white px-1 py-1">
              <button
                type="button"
                aria-label="Previous range"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#5f5d57] hover:bg-[#f4f4ef]"
                onClick={() => shiftRange(-1)}
              >
                <ChevronLeftIcon />
              </button>
              <span className="px-2 text-sm font-medium text-ww-ink">{rangeLabel}</span>
              <button
                type="button"
                aria-label="Next range"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#5f5d57] hover:bg-[#f4f4ef]"
                onClick={() => shiftRange(1)}
              >
                <ChevronRightIcon />
              </button>
            </div>

            <button
              type="button"
              className="rounded-xl border border-ww-border bg-white px-4 py-2 text-sm font-medium text-[#48453f] transition-colors hover:bg-[#f4f4ef]"
              onClick={jumpToday}
            >
              Today
            </button>
          </div>
        </header>

        <div
          className="wireframe-calendar-week"
          aria-label="Weekly process calendar"
          ref={boardRef}
          onWheel={handleWheel}
        >
          <div className="wireframe-calendar-week__inner">
            <div
              className="wireframe-calendar-week__header"
              style={{ gridTemplateColumns: `136px repeat(${weekDays.length}, minmax(104px, 1fr))` }}
            >
              <div className="wireframe-calendar-week__site-heading">Sites</div>
              {weekDays.map((day) => (
                <div
                  key={day.key}
                  className={[
                    "wireframe-calendar-week__day-heading",
                    day.isWeekend ? "wireframe-calendar-week__day-heading--weekend" : undefined
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span>{day.label}</span>
                  <small>{day.sublabel}</small>
                </div>
              ))}
            </div>

            {calendarModel.sites.map((site) => (
              <div key={site.id} className="wireframe-calendar-week__row">
                <div className="wireframe-calendar-week__site-cell">
                  <SiteIcon site={site} />
                  <span>
                    <strong>{site.name}</strong>
                    <small>{site.region}</small>
                  </span>
                </div>
                <div
                  className="wireframe-calendar-week__track"
                  data-calendar-site-track
                  data-location={site.id}
                  onPointerDown={handleTrackPointerDown}
                  onDoubleClick={handleTrackDoubleClick}
                >
                  <div
                    className="wireframe-calendar-week__day-grid"
                    aria-hidden="true"
                    style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
                  >
                    {weekDays.map((day) => (
                      <span
                        key={day.key}
                        className={day.isWeekend ? "wireframe-calendar-week__day--weekend" : undefined}
                      />
                    ))}
                  </div>

                  {visibleEvents
                    .filter((event) => event.location === site.id)
                    .map((event) => {
                      const title = getEventTitle(event, stepsById);
                      const showDescription = Boolean(event.description && event.description !== title);

                      return (
                        <article
                          key={event.id}
                          className={[
                            "wireframe-calendar-event",
                            `wireframe-calendar-event--${getEventTone(event, stepsById)}`,
                            selectedEventId === event.id ? "wireframe-calendar-event--selected" : undefined,
                            canWrite ? "wireframe-calendar-event--interactive" : undefined
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={getEventStyle(event, weekDays)}
                          onPointerDown={(pointerEvent) => handleEventPointerDown(pointerEvent, event)}
                        >
                          {canWrite ? (
                            <button
                              type="button"
                              aria-label="Resize start"
                              className="wireframe-calendar-event__resize wireframe-calendar-event__resize--left"
                              onPointerDown={(pointerEvent) => handleEventPointerDown(pointerEvent, event, "left")}
                            />
                          ) : null}
                          <div className="wireframe-calendar-event__header">
                            <h3>{title}</h3>
                            {isMockDraftEvent(event) ? <span>Draft</span> : null}
                          </div>
                          {event.people.length ? (
                            <p className="wireframe-calendar-event__person">
                              <UserIcon />
                              {event.people.map((person) => toDisplayName(person.display_name)).join(", ")}
                            </p>
                          ) : null}
                          <p className="wireframe-calendar-event__time">
                            {formatTimeRange(event.starts_at, event.ends_at)}
                          </p>
                          {showDescription ? (
                            <p className="wireframe-calendar-event__description">{event.description}</p>
                          ) : null}
                          {canWrite ? (
                            <button
                              type="button"
                              aria-label="Resize end"
                              className="wireframe-calendar-event__resize wireframe-calendar-event__resize--right"
                              onPointerDown={(pointerEvent) => handleEventPointerDown(pointerEvent, event, "right")}
                            />
                          ) : null}
                        </article>
                      );
                    })}

                  {draft?.location === site.id ? (
                    <article
                      className="wireframe-calendar-event wireframe-calendar-event--amber wireframe-calendar-event--draft"
                      style={getDraftStyle(draft, weekDays)}
                    >
                      <div className="wireframe-calendar-event__header">
                        <h3>New event</h3>
                        <span>Draft</span>
                      </div>
                      <p className="wireframe-calendar-event__time">
                        {formatTimeRange(draft.startsAt, draft.endsAt)}
                      </p>
                      <p className="wireframe-calendar-event__description">
                        {actionMode === "manual"
                          ? manualAction || "Manual action"
                          : stepsById.get(selectedStepId) ?? "Process step"}
                      </p>
                    </article>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {canWrite && (draft || selectedEvent || error) ? (
          <div className="wireframe-calendar-editor">
            {draft ? (
              <>
                <div className="wireframe-calendar-editor__summary">
                  <strong>New event</strong>
                  <span>
                    {draft.location} · {formatTimeRange(draft.startsAt, draft.endsAt)}
                  </span>
                </div>
                <label>
                  <span>Action</span>
                  <select
                    value={actionMode === "manual" ? "__manual" : selectedStepId}
                    onChange={(event) => {
                      if (event.target.value === "__manual") {
                        setActionMode("manual");
                        setSelectedStepId("");
                      } else {
                        setActionMode("step");
                        setSelectedStepId(event.target.value);
                      }
                    }}
                  >
                    {steps.map((step) => (
                      <option key={step.id} value={step.id}>
                        {step.name}
                      </option>
                    ))}
                    <option value="__manual">Manual action</option>
                  </select>
                </label>
                {actionMode === "manual" ? (
                  <label>
                    <span>Manual</span>
                    <input
                      value={manualAction}
                      onChange={(event) => setManualAction(event.target.value)}
                      placeholder="Tool cleaning"
                    />
                  </label>
                ) : null}
                <label>
                  <span>Owner</span>
                  <select
                    value={selectedPersonIds[0] ?? ""}
                    onChange={(event) => setSelectedPersonIds(event.target.value ? [event.target.value] : [])}
                  >
                    <option value="">Unassigned</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {toDisplayName(person.display_name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Note</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional note"
                  />
                </label>
                <div className="wireframe-calendar-editor__actions">
                  <button type="button" onClick={saveDraft} disabled={isPending || !selectedPersonIds.length}>
                    Save
                  </button>
                  <button type="button" onClick={() => setDraft(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : selectedEvent ? (
              <>
                <div className="wireframe-calendar-editor__summary">
                  <strong>{getEventTitle(selectedEvent, stepsById)}</strong>
                  <span>
                    {selectedEvent.location} · {formatTimeRange(selectedEvent.starts_at, selectedEvent.ends_at)}
                  </span>
                </div>
                <div className="wireframe-calendar-editor__meta">
                  {selectedEvent.people.map((person) => toDisplayName(person.display_name)).join(", ") ||
                    "Unassigned"}
                </div>
                <div className="wireframe-calendar-editor__actions">
                  <button type="button" onClick={() => setSelectedEventId(null)}>
                    Close
                  </button>
                  <button type="button" className="is-danger" onClick={deleteSelectedEvent} disabled={isPending}>
                    Delete
                  </button>
                </div>
              </>
            ) : null}
            {error ? <p className="wireframe-calendar-editor__error">{error}</p> : null}
          </div>
        ) : null}
      </section>

      <UpcomingHandoffs handoffs={calendarModel.handoffs} />
    </div>
  );
}
