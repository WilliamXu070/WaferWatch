"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createProcessCalendarEvent,
  deleteProcessCalendarEvent,
  moveProcessCalendarEvent,
  updateProcessCalendarEvent
} from "@/features/calendar/actions";
import type { ProcessCalendarLocation } from "@/features/calendar/queries";
import type { CalendarEventModel, CalendarPersonModel, CalendarSiteModel } from "../types";
import {
  BuildingIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  TowerIcon,
  UserIcon
} from "../icons";
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

type CalendarColumn = {
  endsAt: number;
  key: string;
  label: string;
  sublabel: string;
  startsAt: number;
  isWeekend: boolean;
  isHour: boolean;
};

type CalendarWindow = {
  columns: CalendarColumn[];
  endsAt: number;
  startsAt: number;
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
      personIds: string[];
      pointerOffsetMs: number;
      durationMs: number;
    }
  | {
      type: "resize";
      eventId: string;
      edge: ResizeEdge;
      originalEvent: CalendarEventModel;
      personIds: string[];
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
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
const MIN_EVENT_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_MS = 60 * 60 * 1000;
const SNAP_MS = 15 * 60 * 1000;
const TRAVEL_BUFFER_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EVENT_ID_PREFIX = "local-event";
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

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getMondayWeekStart(date: Date) {
  const next = startOfLocalDay(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

function getMonthStart(date: Date) {
  const next = startOfLocalDay(date);
  next.setDate(1);
  return next;
}

function buildDateAtHour(date: Date, hour: number) {
  const next = startOfLocalDay(date);
  next.setHours(hour, 0, 0, 0);
  return next;
}

function snapTime(time: number) {
  return Math.round(time / SNAP_MS) * SNAP_MS;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatHourLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: WIRE_TIME_ZONE
  }).format(date);
}

function intervalsOverlap(startsAt: number, endsAt: number, otherStartsAt: number, otherEndsAt: number) {
  return startsAt < otherEndsAt && endsAt > otherStartsAt;
}

function buildDateColumns(startDate: string, days: number): CalendarColumn[] {
  const start = dateFromKey(startDate);

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index);
    const nextDate = addDays(date, 1);

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
      startsAt: date.getTime(),
      endsAt: nextDate.getTime(),
      isWeekend: weekday === "Sat" || weekday === "Sun",
      isHour: false
    };
  });
}

function buildHourColumns(startDate: string): CalendarColumn[] {
  const start = dateFromKey(startDate);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: WIRE_TIME_ZONE
  }).format(start);

  return Array.from({ length: WORK_END_HOUR - WORK_START_HOUR }, (_, index) => {
    const startsAt = buildDateAtHour(start, WORK_START_HOUR + index);
    const endsAt = new Date(startsAt.getTime() + HOUR_MS);

    return {
      key: `${formatDateKey(start)}-${WORK_START_HOUR + index}`,
      label: formatHourLabel(startsAt),
      sublabel: dateLabel,
      startsAt: startsAt.getTime(),
      endsAt: endsAt.getTime(),
      isWeekend: start.getDay() === 0 || start.getDay() === 6,
      isHour: true
    };
  });
}

function buildCalendarWindow(mode: RangeMode, visibleStart: Date): CalendarWindow {
  const columns = mode === "Day"
    ? buildHourColumns(formatDateKey(visibleStart))
    : buildDateColumns(formatDateKey(visibleStart), MODE_DAY_COUNT[mode]);

  return {
    columns,
    startsAt: columns[0].startsAt,
    endsAt: columns[columns.length - 1].endsAt
  };
}

function ratioToDate(ratio: number, calendarWindow: CalendarWindow) {
  const span = calendarWindow.endsAt - calendarWindow.startsAt;
  return new Date(calendarWindow.startsAt + clamp(ratio, 0, 1) * span);
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

function formatRangeLabel(mode: RangeMode, calendarWindow: CalendarWindow) {
  const first = new Date(calendarWindow.startsAt);
  const last = mode === "Day"
    ? new Date(calendarWindow.startsAt)
    : new Date(calendarWindow.endsAt - DAY_MS);
  const sameMonth = first.getMonth() === last.getMonth();
  const sameYear = first.getFullYear() === last.getFullYear();
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: WIRE_TIME_ZONE,
    weekday: "short"
  });

  if (mode === "Day") {
    return `${dayFormatter.format(first)} · ${formatHourLabel(new Date(calendarWindow.startsAt))} - ${formatHourLabel(
      new Date(calendarWindow.endsAt)
    )}`;
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

function getToneFromLabel(label: string): EventTone {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("lith") ||
    normalized.includes("coat") ||
    normalized.includes("expose") ||
    normalized.includes("inspect")
  ) {
    return "blue";
  }

  if (normalized.includes("clean") || normalized.includes("pol")) {
    return "green";
  }

  return "amber";
}

function getFallbackToneFromSeed(seed: string): EventTone {
  const seedValue = seed
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);

  if (seedValue % 3 === 1) {
    return "blue";
  }

  if (seedValue % 3 === 2) {
    return "green";
  }

  return "amber";
}

function getEventTone(event: CalendarEventModel, stepsById: Map<string, string>): EventTone {
  const tone = getToneFromLabel(getEventTitle(event, stepsById));
  return tone === "amber" ? getFallbackToneFromSeed(event.id) : tone;
}

function getDraftTone(
  actionMode: ActionMode,
  selectedStepId: string,
  manualAction: string,
  stepsById: Map<string, string>
): EventTone {
  const tone = getToneFromLabel(
    actionMode === "manual"
      ? manualAction || "Manual action"
      : stepsById.get(selectedStepId) || "Process step"
  );

  return tone === "amber"
    ? getFallbackToneFromSeed(`${actionMode}-${selectedStepId}-${manualAction}`)
    : tone;
}

function getSelectionDefaults(
  event: CalendarEventModel | null,
  steps: readonly ProcessStepOption[],
  fallbackPersonId: string = ""
) {
  const fallbackStepId = steps[0]?.id ?? "";

  if (!event) {
    return {
      actionMode: steps.length ? ("step" as ActionMode) : ("manual" as ActionMode),
      selectedStepId: fallbackStepId,
      manualAction: "",
      selectedPersonIds: [],
      description: ""
    };
  }

  return {
    actionMode: event.process_step_id ? ("step" as ActionMode) : ("manual" as ActionMode),
    selectedStepId: event.process_step_id ?? fallbackStepId,
    manualAction: event.manual_action ?? "",
    selectedPersonIds: event.people.length ? event.people.map((person) => person.id) : fallbackPersonId ? [fallbackPersonId] : [],
    description: event.description ?? ""
  };
}

function getEventStyle(event: CalendarEventModel, calendarWindow: CalendarWindow, mode: RangeMode): CSSProperties {
  const span = calendarWindow.endsAt - calendarWindow.startsAt;
  const startRatio = clamp((new Date(event.starts_at).getTime() - calendarWindow.startsAt) / span, 0, 1);
  const endRatio = clamp((new Date(event.ends_at).getTime() - calendarWindow.startsAt) / span, 0, 1);
  const widthRatio = Math.max(0.004, endRatio - startRatio);

  return {
    left: `${startRatio * 100}%`,
    minWidth: mode === "Day" ? "72px" : "92px",
    top: "24px",
    width: `${widthRatio * 100}%`
  };
}

function getDraftStyle(draft: DraftEvent, calendarWindow: CalendarWindow, mode: RangeMode): CSSProperties {
  const span = calendarWindow.endsAt - calendarWindow.startsAt;
  const startRatio = clamp((draft.startsAt.getTime() - calendarWindow.startsAt) / span, 0, 1);
  const endRatio = clamp((draft.endsAt.getTime() - calendarWindow.startsAt) / span, 0, 1);
  const widthRatio = Math.max(0.004, endRatio - startRatio);

  return {
    left: `${startRatio * 100}%`,
    minWidth: mode === "Day" ? "72px" : "92px",
    top: "24px",
    width: `${widthRatio * 100}%`
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
  const fallbackPersonId = people[0]?.id ?? "";
  const initialSelection = getSelectionDefaults(initialEvents[0] ?? null, steps, fallbackPersonId);
  const [mode, setMode] = useState<RangeMode>("Week");
  const [visibleStart, setVisibleStart] = useState(() => dateFromKey(initialStartDate));
  const [events, setEvents] = useState<CalendarEventModel[]>([...initialEvents]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEvents[0]?.id ?? null);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(initialSelection.actionMode);
  const [selectedStepId, setSelectedStepId] = useState(initialSelection.selectedStepId);
  const [manualAction, setManualAction] = useState(initialSelection.manualAction);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(initialSelection.selectedPersonIds);
  const [description, setDescription] = useState(initialSelection.description);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const eventsRef = useRef<CalendarEventModel[]>([...initialEvents]);

  const calendarWindow = useMemo(() => buildCalendarWindow(mode, visibleStart), [mode, visibleStart]);
  const columns = calendarWindow.columns;
  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step.name])), [steps]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const visibleEvents = events.filter((event) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    return startsAt.getTime() < calendarWindow.endsAt && endsAt.getTime() > calendarWindow.startsAt;
  });
  const rangeLabel = formatRangeLabel(mode, calendarWindow);
  const canPersist = backendEnabled;
  const canEditEvents = true;
  const columnMinWidth = mode === "Day" ? 84 : mode === "Month" ? 78 : 104;
  const headerGridTemplateColumns = `136px repeat(${columns.length}, minmax(${columnMinWidth}px, 1fr))`;
  const trackGridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`;

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

  const syncSelectionFormToEvent = useCallback(
    (event: CalendarEventModel | null) => {
      const nextSelection = getSelectionDefaults(event, steps, fallbackPersonId);

      setActionMode(nextSelection.actionMode);
      setSelectedStepId(nextSelection.selectedStepId);
      setManualAction(nextSelection.manualAction);
      setSelectedPersonIds(nextSelection.selectedPersonIds);
      setDescription(nextSelection.description);
    },
    [fallbackPersonId, steps]
  );

  const getPointerTarget = useCallback((event: PointerEvent | ReactPointerEvent | WheelEvent) => {
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
      time: snapTime(ratioToDate(ratio, calendarWindow).getTime())
    };
  }, [calendarWindow]);

  const hasScheduleConflict = useCallback(
    (
      location: ProcessCalendarLocation,
      startsAt: number,
      endsAt: number,
      personIds: readonly string[] = [],
      ignoreEventId?: string
    ) => {
      const candidatePersons = new Set(personIds);

      return eventsRef.current.some((event) => {
        if (event.id === ignoreEventId) return false;

      const eventStartsAt = new Date(event.starts_at).getTime();
      const eventEndsAt = new Date(event.ends_at).getTime();
      const sameLocation = event.location === location;

      if (sameLocation) {
        return intervalsOverlap(startsAt, endsAt, eventStartsAt, eventEndsAt);
      }

      const sharesPerson = event.people.some((person) => candidatePersons.has(person.id));
      if (!sharesPerson || !candidatePersons.size) {
        return false;
      }

      const conflictStartsAt = eventStartsAt - TRAVEL_BUFFER_MS;
      const conflictEndsAt = eventEndsAt + TRAVEL_BUFFER_MS;

      return intervalsOverlap(startsAt, endsAt, conflictStartsAt, conflictEndsAt);
    });
  },
    []
  );

  const updateDraftFromSelection = useCallback(
    (anchorTime: number, location: ProcessCalendarLocation, currentTime: number) => {
      const startsAt = new Date(Math.min(anchorTime, currentTime));
      const endsAt = new Date(Math.max(currentTime, anchorTime + MIN_EVENT_MS));

      setDraft({
        location,
        startsAt,
        endsAt: endsAt.getTime() - startsAt.getTime() < MIN_EVENT_MS
          ? new Date(startsAt.getTime() + MIN_EVENT_MS)
          : endsAt
      });
    },
    []
  );

  const getDragPersonIds = useCallback(
    (calendarEvent: CalendarEventModel) => {
      if (calendarEvent.people.length) {
        return calendarEvent.people.map((person) => person.id);
      }

      return selectedPersonIds;
    },
    [selectedPersonIds]
  );

  const generateMockEvent = useCallback(
    (input: DraftEvent): CalendarEventModel => ({
      id: `${EVENT_ID_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      process_template_id: process.id,
      location: input.location,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      process_step_id: actionMode === "step" ? selectedStepId || null : null,
      manual_action: actionMode === "manual" ? (manualAction || null) : null,
      description: description.trim() || null,
      people: selectedPersonIds.map((personId) => peopleById.get(personId)).filter((person): person is CalendarPersonModel => Boolean(person))
    }),
    [actionMode, description, manualAction, peopleById, process.id, selectedPersonIds, selectedStepId]
  );

  const handleEventPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    calendarEvent: CalendarEventModel,
    resizeEdge?: ResizeEdge
  ) => {
    if (!canEditEvents) {
      setSelectedEventId(calendarEvent.id);
      setDraft(null);
      return;
    }

    const pointerTarget = getPointerTarget(event);
    if (!pointerTarget) return;

    event.preventDefault();
    event.stopPropagation();
    syncSelectionFormToEvent(calendarEvent);
    setSelectedEventId(calendarEvent.id);
    setDraft(null);

    const nextDragState: DragState = resizeEdge
      ? {
          type: "resize",
          eventId: calendarEvent.id,
          edge: resizeEdge,
          originalEvent: calendarEvent,
          personIds: getDragPersonIds(calendarEvent)
        }
      : {
          type: "move",
          eventId: calendarEvent.id,
          originalEvent: calendarEvent,
          personIds: getDragPersonIds(calendarEvent),
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

    if (event.shiftKey) {
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
    if (event.target instanceof HTMLElement && event.target.closest(".wireframe-calendar-event")) {
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

    if (!canPersist) {
      return;
    }

    const nextPersonIds = nextEvent.people.length
      ? nextEvent.people.map((person) => person.id)
      : selectedPersonIds;

    if (
      hasScheduleConflict(
        nextEvent.location,
        new Date(nextEvent.starts_at).getTime(),
        new Date(nextEvent.ends_at).getTime(),
        nextPersonIds,
        eventId
      )
    ) {
      setError("This move would overlap another event.");
      setEvents((current) => current.map((event) => (event.id === eventId ? previousEvent : event)));
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
  }, [canPersist, hasScheduleConflict, selectedPersonIds]);

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
        const startsAt = new Date(Math.min(currentDrag.anchorTime, pointerTarget.time));
        const endsAt = new Date(Math.max(pointerTarget.time, currentDrag.anchorTime + MIN_EVENT_MS));

        const safeEnd = new Date(
          endsAt.getTime() - startsAt.getTime() < MIN_EVENT_MS
            ? startsAt.getTime() + MIN_EVENT_MS
            : endsAt.getTime()
        );

        if (hasScheduleConflict(currentDrag.location, startsAt.getTime(), safeEnd.getTime(), selectedPersonIds)) {
          setError("This time overlaps an existing event at this site.");
          return;
        }

        if (error) {
          setError(null);
        }

        setDraft({
          location: currentDrag.location,
          startsAt,
          endsAt: safeEnd
        });
        return;
      }

      const nextEvents = eventsRef.current.map((calendarEvent) => {
        if (calendarEvent.id !== currentDrag.eventId) return calendarEvent;

          if (currentDrag.type === "move") {
            const startsAt = new Date(pointerTarget.time - currentDrag.pointerOffsetMs);
            const endsAt = new Date(startsAt.getTime() + currentDrag.durationMs);
            const snappedStart = new Date(snapTime(startsAt.getTime()));
            const snappedEnd = new Date(snapTime(endsAt.getTime()));

            if (
              hasScheduleConflict(
                pointerTarget.location,
                snappedStart.getTime(),
                snappedEnd.getTime(),
                currentDrag.personIds,
                currentDrag.eventId
              )
            ) {
              setError("This move would overlap another event.");
              return calendarEvent;
            }

            if (error) {
              setError(null);
            }

            return {
              ...calendarEvent,
              location: pointerTarget.location,
              starts_at: snappedStart.toISOString(),
              ends_at: snappedEnd.toISOString()
            };
          }

          const originalStart = new Date(calendarEvent.starts_at).getTime();
          const originalEnd = new Date(calendarEvent.ends_at).getTime();
          const resizedStart = currentDrag.edge === "left" ? pointerTarget.time : originalStart;
          const resizedEnd = currentDrag.edge === "right" ? pointerTarget.time : originalEnd;

          if (resizedEnd - resizedStart < MIN_EVENT_MS) return calendarEvent;

          const snappedResizedStart = snapTime(resizedStart);
          const snappedResizedEnd = snapTime(resizedEnd);
          const nextLocation = calendarEvent.location;

          if (
            hasScheduleConflict(
              nextLocation,
              snappedResizedStart,
              snappedResizedEnd,
              currentDrag.personIds,
              currentDrag.eventId
            )
          ) {
            setError("This resize would overlap another event.");
            return calendarEvent;
          }

          if (error) {
            setError(null);
          }

          return {
            ...calendarEvent,
            starts_at: new Date(snappedResizedStart).toISOString(),
            ends_at: new Date(snappedResizedEnd).toISOString()
          };
        }
      );

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
    }, [commitMove, dragState, error, getPointerTarget, hasScheduleConflict, selectedPersonIds, updateDraftFromSelection]);

  const saveDraft = () => {
    if (!draft || !canWrite) return;

    const startsAt = draft.startsAt.getTime();
    const endsAt = draft.endsAt.getTime();

    if (hasScheduleConflict(draft.location, startsAt, endsAt, selectedPersonIds)) {
      setError("Cannot create this event because it overlaps another event.");
      return;
    }

    if (!canPersist) {
      const nextEvent = generateMockEvent(draft);

      setEvents((current) => [...current, nextEvent].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      syncSelectionFormToEvent(nextEvent);
      setSelectedEventId(nextEvent.id);
      setDraft(null);
      return;
    }

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
      syncSelectionFormToEvent(createdEvent);
      setEvents((current) => [...current, createdEvent].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setSelectedEventId(createdEvent.id);
      setDraft(null);
    });
  };

  const deleteSelectedEvent = () => {
    if (!selectedEvent || !canWrite) return;
    if (!canPersist) {
      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      setSelectedEventId(null);
      setError(null);
      return;
    }

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

  const saveSelectedEvent = () => {
    if (!selectedEvent || !canWrite) return;

    setError(null);

    if (!selectedPersonIds.length) {
      setError("Assign at least one person.");
      return;
    }

    startTransition(async () => {
      if (!canPersist) {
        const nextEvent = {
          ...selectedEvent,
          process_step_id: actionMode === "step" ? selectedStepId || null : null,
          manual_action: actionMode === "manual" ? (manualAction || null) : null,
          description: description.trim() || null,
          people: selectedPersonIds
            .map((personId) => peopleById.get(personId))
            .filter((person): person is CalendarPersonModel => Boolean(person))
        };

        setEvents((current) => current.map((event) => (event.id === selectedEvent.id ? nextEvent : event)));
        return;
      }

      const nextEvent = {
        ...selectedEvent,
        process_step_id: actionMode === "step" ? selectedStepId || null : null,
        manual_action: actionMode === "manual" ? (manualAction || null) : null,
        description: description.trim() || null,
        people: selectedPersonIds
          .map((personId) => peopleById.get(personId))
          .filter((person): person is CalendarPersonModel => Boolean(person))
      };

      const result = await updateProcessCalendarEvent({
        eventId: selectedEvent.id,
        processStepId: nextEvent.process_step_id,
        manualAction: nextEvent.manual_action,
        description: nextEvent.description,
        personIds: selectedPersonIds
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const updatedEvent = result.data as CalendarEventModel;
      syncSelectionFormToEvent(updatedEvent);
      setEvents((current) => current.map((event) => (event.id === selectedEvent.id ? updatedEvent : event)));
    });
  };

  const canWrite = canPersist || !backendEnabled;

  const getCurrentFocusDate = useCallback(() => {
    if (selectedEvent) {
      const startsAt = new Date(selectedEvent.starts_at).getTime();
      const endsAt = new Date(selectedEvent.ends_at).getTime();
      return new Date((startsAt + endsAt) / 2);
    }

    return new Date((calendarWindow.startsAt + calendarWindow.endsAt) / 2);
  }, [calendarWindow.endsAt, calendarWindow.startsAt, selectedEvent]);

  const getModeStart = useCallback((nextMode: RangeMode, focusDate: Date) => {
    if (nextMode === "Week") return getMondayWeekStart(focusDate);
    if (nextMode === "Month") return getMonthStart(focusDate);
    return startOfLocalDay(focusDate);
  }, []);

  const handleModeChange = useCallback((nextMode: RangeMode, focusDate = getCurrentFocusDate()) => {
    setMode(nextMode);
    setVisibleStart(getModeStart(nextMode, focusDate));
  }, [getCurrentFocusDate, getModeStart]);

  const shiftRange = (direction: -1 | 1) => {
    setVisibleStart((current) => {
      if (mode === "Month") return addMonths(current, direction);
      return addDays(current, direction * MODE_DAY_COUNT[mode]);
    });
  };

  const jumpToday = () => {
    const today = new Date();
    setVisibleStart(getModeStart(mode, today));
  };

  const zoomCalendar = useCallback((direction: "in" | "out", focusTime?: number) => {
    const modeIndex = rangeModes.indexOf(mode);
    const nextMode = rangeModes[clamp(modeIndex + (direction === "in" ? -1 : 1), 0, rangeModes.length - 1)];

    if (nextMode === mode) {
      return;
    }

    handleModeChange(nextMode, focusTime ? new Date(focusTime) : getCurrentFocusDate());
  }, [getCurrentFocusDate, handleModeChange, mode]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const handleContainedWheelZoom = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!(event.target instanceof Node) || !board.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      const pointerTarget = getPointerTarget(event);
      zoomCalendar(event.deltaY < 0 ? "in" : "out", pointerTarget?.time);
    };

    const preventContainedGestureZoom = (event: Event) => {
      if (!(event.target instanceof Node) || !board.contains(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener("wheel", handleContainedWheelZoom, { capture: true, passive: false });
    document.addEventListener("gesturestart", preventContainedGestureZoom, { passive: false });
    document.addEventListener("gesturechange", preventContainedGestureZoom, { passive: false });
    document.addEventListener("gestureend", preventContainedGestureZoom, { passive: false });

    return () => {
      document.removeEventListener("wheel", handleContainedWheelZoom, { capture: true });
      document.removeEventListener("gesturestart", preventContainedGestureZoom);
      document.removeEventListener("gesturechange", preventContainedGestureZoom);
      document.removeEventListener("gestureend", preventContainedGestureZoom);
    };
  }, [getPointerTarget, zoomCalendar]);

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

            <div className="flex items-center gap-1 rounded-xl border border-ww-border bg-white px-1 py-1">
              <button
                type="button"
                aria-label="Zoom out"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#5f5d57] hover:bg-[#f4f4ef] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={mode === "Month"}
                onClick={() => zoomCalendar("out")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#5f5d57] hover:bg-[#f4f4ef] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={mode === "Day"}
                onClick={() => zoomCalendar("in")}
              >
                <PlusIcon />
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
          data-calendar-mode={mode.toLowerCase()}
          ref={boardRef}
        >
          <div className="wireframe-calendar-week__inner">
            <div
              className="wireframe-calendar-week__header"
              style={{ gridTemplateColumns: headerGridTemplateColumns }}
            >
              <div className="wireframe-calendar-week__site-heading">Sites</div>
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={[
                    "wireframe-calendar-week__day-heading",
                    column.isWeekend ? "wireframe-calendar-week__day-heading--weekend" : undefined,
                    column.isHour ? "wireframe-calendar-week__day-heading--hour" : undefined
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span>{column.label}</span>
                  <small>{column.sublabel}</small>
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
                    style={{ gridTemplateColumns: trackGridTemplateColumns }}
                  >
                    {columns.map((column) => (
                      <span
                        key={column.key}
                        className={[
                          column.isWeekend ? "wireframe-calendar-week__day--weekend" : undefined,
                          column.isHour ? "wireframe-calendar-week__day--hour" : undefined
                        ]
                          .filter(Boolean)
                          .join(" ")}
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
                            canEditEvents ? "wireframe-calendar-event--interactive" : undefined
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={getEventStyle(event, calendarWindow, mode)}
                          onPointerDown={(pointerEvent) => handleEventPointerDown(pointerEvent, event)}
                        >
                          {canEditEvents ? (
                            <button
                              type="button"
                              aria-label="Resize start"
                              className="wireframe-calendar-event__resize wireframe-calendar-event__resize--left"
                              onPointerDown={(pointerEvent) => {
                                pointerEvent.preventDefault();
                                pointerEvent.stopPropagation();
                                handleEventPointerDown(pointerEvent, event, "left");
                              }}
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
                          {canEditEvents ? (
                            <button
                              type="button"
                              aria-label="Resize end"
                              className="wireframe-calendar-event__resize wireframe-calendar-event__resize--right"
                              onPointerDown={(pointerEvent) => {
                                pointerEvent.preventDefault();
                                pointerEvent.stopPropagation();
                                handleEventPointerDown(pointerEvent, event, "right");
                              }}
                            />
                          ) : null}
                        </article>
                      );
                    })}

                  {draft?.location === site.id ? (
                    <article
                      className={`wireframe-calendar-event wireframe-calendar-event--${getDraftTone(
                        actionMode,
                        selectedStepId,
                        manualAction,
                        stepsById
                      )} wireframe-calendar-event--draft`}
                      style={getDraftStyle(draft, calendarWindow, mode)}
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

        {(draft || selectedEvent || error) ? (
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
                  <button type="button" onClick={saveSelectedEvent} disabled={isPending || !selectedPersonIds.length}>
                    Save
                  </button>
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
