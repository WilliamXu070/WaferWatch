"use client";

import {
  CSSProperties,
  HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import Timeline, {
  DateHeader,
  SidebarHeader,
  TimelineHeaders,
  type Id,
  type OnTimeChange,
  type ReactCalendarTimelineProps,
  type TimelineGroupBase,
  type TimelineItemBase
} from "react-calendar-timeline";
import {
  createProcessCalendarEvent,
  deleteProcessCalendarEvent,
  moveProcessCalendarEvent,
  updateProcessCalendarEvent
} from "@/features/calendar/actions";
import type {
  ProcessCalendarEventView,
  ProcessCalendarLocation,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";

type ProcessStepOption = {
  id: string;
  name: string;
};

type DraftEvent = {
  location: ProcessCalendarLocation;
  startsAt: Date;
  endsAt: Date;
};

type DraftDragSelection = {
  pointerId: number;
  location: ProcessCalendarLocation;
  anchorTime: number;
  currentTime: number;
};

type TimelinePanState = {
  pointerId: number;
  startX: number;
  startStart: number;
  startEnd: number;
  moved: boolean;
};

type PendingTimelineMove = {
  eventId: string;
  previous: MoveWindow;
  next: MoveWindow;
};

type MoveWindow = {
  location: ProcessCalendarLocation;
  startsAt: string;
  endsAt: string;
};

type ActionMode = "step" | "manual";
type StageFilterId = string | "__manual__";
type CalendarPresentationMode = "default" | "wireframe";
type CalendarPersistenceMode = "server" | "local";

type TimelineHeaderScale = {
  id: "minutes" | "hours" | "blocks" | "days";
  primaryUnit: "day" | "month";
  primaryLabelFormat: (timeRange: [Dayjs, Dayjs]) => string;
  secondaryUnit: "minute" | "hour" | "day";
  secondaryLabelFormat: (timeRange: [Dayjs, Dayjs]) => string;
  hourStep: 1 | 6;
};

type TimelineLocationGroup = TimelineGroupBase & {
  id: ProcessCalendarLocation;
  title: string;
  stackItems: true;
};

type CalendarTimelineRef = {
  getBoundingClientRect(): DOMRect;
};

type CalendarTimelineItem = TimelineItemBase<number> & {
  id: string;
  group: ProcessCalendarLocation;
  title: string;
  badgeLabel?: string;
  descriptionLabel?: string;
  event?: ProcessCalendarEventView;
  peopleLabel: string;
  timeLabel: string;
  toneClass: string;
  isDraft?: boolean;
};

type ProcessCalendarBoardProps = {
  processTemplateId: string;
  calendarStartDate: string;
  days: number;
  steps: ProcessStepOption[];
  people: ProcessCalendarPersonOption[];
  initialEvents: ProcessCalendarEventView[];
  initialVisibleStartDate?: string;
  persistenceMode?: CalendarPersistenceMode;
  presentationMode?: CalendarPresentationMode;
};

const LOCATIONS: ProcessCalendarLocation[] = ["McMaster", "Waterloo", "Toronto"];
const LOCATION_REGIONS: Record<ProcessCalendarLocation, string> = {
  McMaster: "Hamilton",
  Waterloo: "Waterloo",
  Toronto: "Toronto"
};
const START_HOUR = 8;
const END_HOUR = 18;
const START_MINUTE = START_HOUR * 60;
const END_MINUTE = END_HOUR * 60;
const SNAP_MS = 15 * 60 * 1000;
const MIN_EVENT_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_MS = 60 * 60 * 1000;
const MIN_ZOOM_MS = 2 * 60 * 60 * 1000;
const TRAVEL_BUFFER_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WEEK_ZOOM_MS = 7 * DAY_MS;
const HOUR_MS = 60 * 60 * 1000;
const MANUAL_STAGE_FILTER_ID = "__manual__";

const TIMELINE_KEYS = {
  groupIdKey: "id",
  groupTitleKey: "title",
  groupRightTitleKey: "rightTitle",
  groupLabelKey: "title",
  itemIdKey: "id",
  itemTitleKey: "title",
  itemDivTitleKey: "title",
  itemGroupKey: "group",
  itemTimeStartKey: "start_time",
  itemTimeEndKey: "end_time"
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function buildDateAtMinute(date: Date, minute: number) {
  const next = new Date(date);
  next.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampVisibleWindow(
  requestedStart: number,
  requestedEnd: number,
  timelineStart: number,
  timelineEnd: number
) {
  const maxSpan = timelineEnd - timelineStart;
  const minSpan = MIN_ZOOM_MS;

  const requestedSpan = requestedEnd - requestedStart;
  if (requestedSpan >= maxSpan) {
    return { start: timelineStart, end: timelineEnd };
  }

  const span = clamp(requestedSpan, minSpan, maxSpan);
  const start = clamp(requestedStart, timelineStart, timelineEnd - span);
  const end = start + span;

  return { start, end };
}

function snapTime(time: number) {
  return Math.round(time / SNAP_MS) * SNAP_MS;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${displayHour}:${String(minute % 60).padStart(2, "0")} ${suffix}`;
}

function formatDateTime(date: Date) {
  return `${date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  })} ${formatMinute(date.getHours() * 60 + date.getMinutes())}`;
}

function formatWindow(startsAt: Date, endsAt: Date) {
  return `${formatDateTime(startsAt)} - ${formatMinute(endsAt.getHours() * 60 + endsAt.getMinutes())}`;
}

function formatCompactDateTime(date: Date) {
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

function formatTimelineItemWindow(startsAt: Date, endsAt: Date, presentationMode: CalendarPresentationMode) {
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

function toDisplayName(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function eventLabel(event: ProcessCalendarEventView, stepsById: Map<string, string>) {
  if (event.process_step_id) {
    return stepsById.get(event.process_step_id) ?? "Process step";
  }

  return event.manual_action ?? "Manual action";
}

function eventTone(label: string, presentationMode: CalendarPresentationMode) {
  const normalized = label.toLowerCase();

  if (presentationMode === "wireframe") {
    if (normalized.includes("lith") || normalized.includes("expose") || normalized.includes("inspect")) {
      return "ww-timeline-item--blue";
    }

    if (normalized.includes("clean") || normalized.includes("pol")) {
      return "ww-timeline-item--green";
    }

    return "ww-timeline-item--amber";
  }

  if (normalized.includes("pol")) return "ww-timeline-item--green";
  if (normalized.includes("inspect")) return "ww-timeline-item--blue";
  if (normalized.includes("clean")) return "ww-timeline-item--soft";
  return "ww-timeline-item--pink";
}

function getWireframeEventTitle(event: ProcessCalendarEventView, label: string, presentationMode: CalendarPresentationMode) {
  if (presentationMode === "wireframe" && event.id === "evt-intake") {
    return "New event";
  }

  return label;
}

function getWireframeEventBadge(event: ProcessCalendarEventView, presentationMode: CalendarPresentationMode) {
  return presentationMode === "wireframe" && event.id === "evt-intake" ? "Draft" : undefined;
}

function intervalsOverlap(startsAt: Date, endsAt: Date, otherStartsAt: Date, otherEndsAt: Date) {
  return startsAt < otherEndsAt && endsAt > otherStartsAt;
}

function sortCalendarEvents(events: ProcessCalendarEventView[]) {
  return [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function toggleSelection(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function toMoveWindow(event: ProcessCalendarEventView): MoveWindow {
  return {
    location: event.location as ProcessCalendarLocation,
    startsAt: event.starts_at,
    endsAt: event.ends_at
  };
}

function applyMoveWindow(event: ProcessCalendarEventView, window: MoveWindow): ProcessCalendarEventView {
  return {
    ...event,
    location: window.location,
    starts_at: window.startsAt,
    ends_at: window.endsAt
  };
}

function getEventDuration(event: ProcessCalendarEventView) {
  return new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();
}

function draftFromSelection(selection: DraftDragSelection, minTime: number, maxTime: number): DraftEvent {
  let startsAt = Math.min(selection.anchorTime, selection.currentTime);
  const selectedEnd = Math.max(selection.anchorTime, selection.currentTime);
  let endsAt = Math.max(selectedEnd, startsAt + MIN_EVENT_MS);

  if (endsAt > maxTime) {
    endsAt = maxTime;
    startsAt = Math.max(minTime, endsAt - MIN_EVENT_MS);
  }

  return {
    location: selection.location,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt)
  };
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

function getHeaderScale(visibleSpan: number): TimelineHeaderScale {
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

function isCurrentDay(timestamp: number) {
  return dayjs(timestamp).isSame(dayjs(), "day");
}

function createCurrentDayHeaderRenderer(highlightDay: boolean) {
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

function createWireframeDayHeaderRenderer() {
  return function WireframeDayHeaderRenderer({
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

    return (
      <div
        key={intervalKey}
        {...safeIntervalProps}
        className={[
          intervalClassName,
          "ww-timeline-wireframe-day-header",
          isCurrentDay(startTime.valueOf()) ? "ww-timeline-date-header--today" : undefined
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <strong>{startTime.format("ddd D")}</strong>
        <span>{startTime.format("MMM D")}</span>
      </div>
    );
  };
}

function isBlankTimelineTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const nonPanSelectors = [
    ".calendar-timeline-toolbar",
    ".rct-item",
    ".rct-item-content",
    ".rct-header-root",
    ".rct-resize",
    ".rct-sidebar",
    ".rct-sidebar-header"
  ];

  if (nonPanSelectors.some((selector) => target.closest(selector))) {
    return false;
  }

  return true;
}

function areMoveWindowsEqual(left: MoveWindow, right: MoveWindow) {
  return left.location === right.location && left.startsAt === right.startsAt && left.endsAt === right.endsAt;
}

export function ProcessCalendarBoard({
  processTemplateId,
  calendarStartDate,
  days,
  steps,
  people,
  initialEvents,
  initialVisibleStartDate = calendarStartDate,
  persistenceMode = "server",
  presentationMode = "default"
}: ProcessCalendarBoardProps) {
  const [events, setEvents] = useState(initialEvents);
  const initialSelection = presentationMode === "wireframe" ? null : initialEvents[0] ?? null;
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialSelection?.id ?? null);
  const [actionMode, setActionMode] = useState<ActionMode>(
    initialSelection
      ? initialSelection.process_step_id
        ? "step"
        : "manual"
      : steps.length
        ? "step"
        : "manual"
  );
  const [selectedStepId, setSelectedStepId] = useState(initialSelection?.process_step_id ?? steps[0]?.id ?? "");
  const [manualAction, setManualAction] = useState(initialSelection?.manual_action ?? "");
  const [description, setDescription] = useState(initialSelection?.description ?? "");
  const [selectedPersonIds, setSelectedPersonIds] = useState(
    initialSelection?.people.map((person) => person.id) ?? []
  );
  const [personQuery, setPersonQuery] = useState("");
  const [draftDragSelection, setDraftDragSelection] = useState<DraftDragSelection | null>(null);
  const [filterPersonIds, setFilterPersonIds] = useState<string[]>([]);
  const [filterStageIds, setFilterStageIds] = useState<StageFilterId[]>([]);
  const [isFilterPanelExpanded, setIsFilterPanelExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timelineRef = useRef<CalendarTimelineRef>(null);
  const timelinePanelRef = useRef<HTMLDivElement>(null);
  const draftDragSelectionRef = useRef<DraftDragSelection | null>(null);
  const timelinePanRef = useRef<TimelinePanState | null>(null);
  const undoStackRef = useRef<Array<{ eventId: string; previous: MoveWindow; next: MoveWindow }>>([]);
  const moveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestMoveRequestRef = useRef(0);
  const timelineScrollSyncRef = useRef<{
    start: number;
    end: number;
    updateScrollCanvas: (start: number, end: number) => void;
  } | null>(null);
  const isItemDragActiveRef = useRef(false);
  const itemMoveRef = useRef<PendingTimelineMove | null>(null);
  const itemMoveFrameRef = useRef<number | null>(null);
  const [timelinePanPointerId, setTimelinePanPointerId] = useState<number | null>(null);
  const [isTimelinePanning, setIsTimelinePanning] = useState(false);

  const startDate = useMemo(() => new Date(`${calendarStartDate}T00:00:00`), [calendarStartDate]);
  const timelineStart = useMemo(() => buildDateAtMinute(startDate, START_MINUTE).getTime(), [startDate]);
  const timelineEnd = useMemo(
    () => buildDateAtMinute(addDays(startDate, Math.max(0, days - 1)), END_MINUTE).getTime(),
    [days, startDate]
  );
  const maxZoomMs = useMemo(() => Math.min(MAX_WEEK_ZOOM_MS, Math.max(1, timelineEnd - timelineStart)), [timelineEnd, timelineStart]);
  const initialVisibleWindow = useMemo(() => {
    const requestedDate = new Date(`${initialVisibleStartDate}T00:00:00`);
    const requestedStart = Number.isNaN(requestedDate.getTime())
      ? timelineStart
      : buildDateAtMinute(requestedDate, START_MINUTE).getTime();

    return clampVisibleWindow(requestedStart, requestedStart + maxZoomMs, timelineStart, timelineEnd);
  }, [initialVisibleStartDate, maxZoomMs, timelineEnd, timelineStart]);
  const [visibleRange, setVisibleRange] = useState(() => ({
    boundsStart: timelineStart,
    boundsEnd: timelineEnd,
    start: initialVisibleWindow.start,
    end: initialVisibleWindow.end
  }));

  const effectiveVisibleRange =
    visibleRange.boundsStart === timelineStart && visibleRange.boundsEnd === timelineEnd
      ? visibleRange
      : {
          boundsStart: timelineStart,
          boundsEnd: timelineEnd,
          start: initialVisibleWindow.start,
          end: initialVisibleWindow.end
        };
  const syncVisibleRange = useCallback(
    (nextStart: number, nextEnd: number, updateScrollCanvas?: (start: number, end: number) => void) => {
      const normalized = clampVisibleWindow(nextStart, nextEnd, timelineStart, timelineEnd);
      const nextRange = {
        boundsStart: timelineStart,
        boundsEnd: timelineEnd,
        ...normalized
      };

      timelineScrollSyncRef.current = {
        start: normalized.start,
        end: normalized.end,
        updateScrollCanvas: updateScrollCanvas ?? (() => {})
      };
      setVisibleRange(nextRange);
    },
    [timelineEnd, timelineStart]
  );
  const headerScale = useMemo(
    () => getHeaderScale(effectiveVisibleRange.end - effectiveVisibleRange.start),
    [effectiveVisibleRange.end, effectiveVisibleRange.start]
  );
  const timelineVerticalLineClassNames = useCallback(
    (lineStart: number) => {
      const lineTime = dayjs(lineStart);
      return [
        isCurrentDay(lineStart) ? "ww-timeline-vline-today" : undefined,
        [0, 6].includes(lineTime.day()) ? "ww-timeline-vline-weekend" : undefined,
        lineTime.hour() === 12 ? "ww-timeline-vline-midday" : undefined
      ].filter(Boolean) as string[];
    },
    []
  );

  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step.name])), [steps]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const selectedPeopleForSave = useCallback(
    () =>
      selectedPersonIds
        .map((personId) => peopleById.get(personId))
        .filter((person): person is ProcessCalendarPersonOption => Boolean(person)),
    [peopleById, selectedPersonIds]
  );
  const stageFilterOptions = useMemo(
    () => [
      ...steps.map((step) => ({ id: step.id as StageFilterId, name: step.name })),
      { id: MANUAL_STAGE_FILTER_ID as StageFilterId, name: "Manual" }
    ],
    [steps]
  );
  const stageFilterOptionsById = useMemo(
    () => new Map(stageFilterOptions.map((stage) => [stage.id, stage.name])),
    [stageFilterOptions]
  );
  const personFilterSummary =
    filterPersonIds.length === 0
      ? "Everyone"
      : filterPersonIds.map((personId) => peopleById.get(personId)?.display_name ?? "Unknown").join(", ");
  const stageFilterSummary =
    filterStageIds.length === 0
      ? "All stages"
      : filterStageIds.map((stageId) => stageFilterOptionsById.get(stageId) ?? "Unknown").join(", ");
  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesPeople =
          filterPersonIds.length === 0 ||
          event.people.some((person) => filterPersonIds.includes(person.id));
        const matchesStage =
          filterStageIds.length === 0 ||
          filterStageIds.some((stageId) =>
            stageId === MANUAL_STAGE_FILTER_ID ? !event.process_step_id : event.process_step_id === stageId
          );

        return matchesPeople && matchesStage;
      }),
    [events, filterPersonIds, filterStageIds]
  );
  const visibleEventById = useMemo(
    () => new Map(visibleEvents.map((event) => [event.id, event])),
    [visibleEvents]
  );
  const selectedEvent = selectedEventId ? visibleEventById.get(selectedEventId) ?? null : null;
  const selectedPeople = selectedPersonIds
    .map((personId) => peopleById.get(personId))
    .filter((person): person is ProcessCalendarPersonOption => Boolean(person));

  const groups = useMemo<TimelineLocationGroup[]>(
    () =>
      LOCATIONS.map((location) => ({
        id: location,
        title: presentationMode === "wireframe" ? `${location}\n${LOCATION_REGIONS[location]}` : location,
        rightTitle: `${visibleEvents.filter((event) => event.location === location).length}`,
        stackItems: true
      })),
    [presentationMode, visibleEvents]
  );

  const timelineItems = useMemo<CalendarTimelineItem[]>(
    () => {
      const items: CalendarTimelineItem[] = visibleEvents.map((event) => {
        const label = eventLabel(event, stepsById);
        const displayTitle = getWireframeEventTitle(event, label, presentationMode);
        const descriptionLabel =
          event.description && event.description !== displayTitle ? event.description : undefined;
        const startsAt = new Date(event.starts_at);
        const endsAt = new Date(event.ends_at);
        const peopleLabel = event.people
          .map((person) => presentationMode === "wireframe" ? toDisplayName(person.display_name) : person.display_name)
          .join(", ");

        return {
          id: event.id,
          group: event.location as ProcessCalendarLocation,
          title: displayTitle,
          badgeLabel: getWireframeEventBadge(event, presentationMode),
          descriptionLabel,
          event,
          peopleLabel,
          timeLabel: formatTimelineItemWindow(startsAt, endsAt, presentationMode),
          toneClass:
            presentationMode === "wireframe" && event.id === "evt-intake"
              ? "ww-timeline-item--amber"
              : eventTone(label, presentationMode),
          start_time: startsAt.getTime(),
          end_time: endsAt.getTime(),
          canMove: true,
          canChangeGroup: true,
          canResize: "both",
          height: presentationMode === "wireframe" ? 110 : 30
        };
      });

      const draftWindow = draftDragSelection
        ? draftFromSelection(draftDragSelection, timelineStart, timelineEnd)
        : draft;

      if (draftWindow) {
        items.push({
          id: "__draft-create__",
          group: draftWindow.location,
          title: "New event",
          badgeLabel: "Draft",
          descriptionLabel: draftDragSelection ? "Release to create" : "Choose action in editor",
          peopleLabel: draftDragSelection ? "Release to create" : "Unsaved draft",
          timeLabel: formatTimelineItemWindow(draftWindow.startsAt, draftWindow.endsAt, presentationMode),
          toneClass: `ww-timeline-item--draft ${draftDragSelection ? "ww-timeline-item--draft-active" : ""}`,
          start_time: draftWindow.startsAt.getTime(),
          end_time: draftWindow.endsAt.getTime(),
          canMove: !draftDragSelection,
          canChangeGroup: !draftDragSelection,
          canResize: draftDragSelection ? false : "both",
          height: presentationMode === "wireframe" ? 110 : 30,
          isDraft: true
        });
      }

      return items;
    },
    [draft, draftDragSelection, presentationMode, stepsById, timelineEnd, timelineStart, visibleEvents]
  );

  const personConflictById = useMemo(() => {
    const conflicts = new Map<string, string>();
    if (!draft) {
      return conflicts;
    }

    for (const event of events) {
      const eventStartsAt = new Date(event.starts_at);
      const eventEndsAt = new Date(event.ends_at);
      const sameLocation = event.location === draft.location;
      const conflictStartsAt = sameLocation
        ? eventStartsAt
        : new Date(eventStartsAt.getTime() - TRAVEL_BUFFER_MS);
      const conflictEndsAt = sameLocation
        ? eventEndsAt
        : new Date(eventEndsAt.getTime() + TRAVEL_BUFFER_MS);

      if (!intervalsOverlap(draft.startsAt, draft.endsAt, conflictStartsAt, conflictEndsAt)) {
        continue;
      }

      const reason = sameLocation
        ? `Booked ${formatWindow(eventStartsAt, eventEndsAt)}`
        : `Travel buffer from ${event.location} ${formatWindow(eventStartsAt, eventEndsAt)}`;

      for (const person of event.people) {
        conflicts.set(person.id, reason);
      }
    }

    return conflicts;
  }, [draft, events]);

  const filteredPeople = people
    .filter((person) => !selectedPersonIds.includes(person.id))
    .filter((person) => person.display_name.toLowerCase().includes(personQuery.trim().toLowerCase()))
    .map((person) => ({
      person,
      conflictReason: personConflictById.get(person.id) ?? null
    }))
    .slice(0, 5);

  const resetDraftForm = useCallback(() => {
    setSelectedEventId(null);
    setError(null);
    setActionMode(steps.length ? "step" : "manual");
    setSelectedStepId(steps[0]?.id ?? "");
    setManualAction("");
    setDescription("");
    setSelectedPersonIds([]);
    setPersonQuery("");
  }, [steps]);

  const openDraft = useCallback((nextDraft: DraftEvent) => {
    setDraft(nextDraft);
    resetDraftForm();
  }, [resetDraftForm]);

  const getTimelinePointerTarget = useCallback((event: PointerEvent | ReactPointerEvent | ReactMouseEvent) => {
    const timeline = timelineRef.current;
    const panel = timelinePanelRef.current;
    if (!timeline || !panel) {
      return null;
    }

    const rect = timeline.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return null;
    }

    const rows = Array.from(
      panel.querySelectorAll<HTMLElement>(".rct-horizontal-lines > .rct-hl-even, .rct-horizontal-lines > .rct-hl-odd")
    );
    const groupIndex = rows.findIndex((row) => {
      const rowRect = row.getBoundingClientRect();
      return event.clientY >= rowRect.top && event.clientY <= rowRect.bottom;
    });
    const group = groups[groupIndex];
    if (!group) {
      return null;
    }

    const visibleSpan = effectiveVisibleRange.end - effectiveVisibleRange.start;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const time = clamp(
      snapTime(effectiveVisibleRange.start + ratio * visibleSpan),
      timelineStart,
      timelineEnd
    );

    return {
      location: group.id,
      time
    };
  }, [effectiveVisibleRange.end, effectiveVisibleRange.start, groups, timelineEnd, timelineStart]);

  const setActiveDraftDrag = useCallback((selection: DraftDragSelection | null) => {
    draftDragSelectionRef.current = selection;
    setDraftDragSelection(selection);
  }, []);

  const setTimelineRef = useCallback((instance: CalendarTimelineRef | null) => {
    timelineRef.current = instance;
  }, []);

  const finishDraftDrag = useCallback((event?: PointerEvent | KeyboardEvent) => {
    const currentSelection = draftDragSelectionRef.current;
    if (!currentSelection) {
      return;
    }

    event?.preventDefault();
    setActiveDraftDrag(null);
    openDraft(draftFromSelection(currentSelection, timelineStart, timelineEnd));
  }, [openDraft, setActiveDraftDrag, timelineEnd, timelineStart]);

  const commitMove = useCallback((input: {
    eventId: string;
    previous: MoveWindow;
    next: MoveWindow;
    recordUndo: boolean;
  }) => {
    const eventToMove = eventById.get(input.eventId);
    if (!eventToMove) {
      setError("Move target no longer exists.");
      return;
    }

    const optimisticEvent = applyMoveWindow(eventToMove, input.next);
    const requestId = latestMoveRequestRef.current + 1;
    latestMoveRequestRef.current = requestId;

    setError(null);
    setEvents((current) =>
      sortCalendarEvents(current.map((event) => (event.id === input.eventId ? optimisticEvent : event)))
    );
    setSelectedEventId(input.eventId);

    if (input.recordUndo) {
      undoStackRef.current.push({
        eventId: input.eventId,
        previous: input.previous,
        next: input.next
      });
    }

    if (persistenceMode === "local") {
      return;
    }

    const persistMove = async () => {
      const result = await moveProcessCalendarEvent({
        eventId: input.eventId,
        location: input.next.location,
        startsAt: input.next.startsAt,
        endsAt: input.next.endsAt
      });

      if (!result.ok) {
        if (requestId === latestMoveRequestRef.current) {
          setEvents((current) =>
            sortCalendarEvents(current.map((event) => (event.id === input.eventId ? eventToMove : event)))
          );
          setError(result.error);
        }

        if (input.recordUndo) {
          undoStackRef.current = undoStackRef.current.filter(
            (entry) =>
              entry.eventId !== input.eventId ||
              entry.previous.startsAt !== input.previous.startsAt ||
              entry.previous.endsAt !== input.previous.endsAt ||
              entry.previous.location !== input.previous.location ||
              entry.next.startsAt !== input.next.startsAt ||
              entry.next.endsAt !== input.next.endsAt ||
              entry.next.location !== input.next.location
          );
        }
        return;
      }

      if (requestId !== latestMoveRequestRef.current) {
        return;
      }

      const movedEvent = result.data as ProcessCalendarEventView;
      setEvents((current) =>
        sortCalendarEvents(current.map((event) => (event.id === movedEvent.id ? movedEvent : event)))
      );
      setSelectedEventId(movedEvent.id);
    };

    moveQueueRef.current = moveQueueRef.current
      .catch(() => undefined)
      .then(persistMove)
      .catch((moveError: unknown) => {
        if (requestId === latestMoveRequestRef.current) {
          setEvents((current) =>
            sortCalendarEvents(current.map((event) => (event.id === input.eventId ? eventToMove : event)))
          );
          setError(moveError instanceof Error ? moveError.message : "Move failed. Try again.");
        }
    });
  }, [eventById, persistenceMode]);

  const clearQueuedItemMove = useCallback(() => {
    if (itemMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(itemMoveFrameRef.current);
      itemMoveFrameRef.current = null;
    }
    itemMoveRef.current = null;
  }, []);

  const stageItemMove = useCallback((eventId: string, next: MoveWindow) => {
    const queued = itemMoveRef.current;
    if (!queued || queued.eventId !== eventId) {
      const eventToMove = eventById.get(eventId);
      if (!eventToMove) {
        return;
      }

      itemMoveRef.current = {
        eventId,
        previous: toMoveWindow(eventToMove),
        next
      };
    } else {
      queued.next = next;
    }

    if (itemMoveFrameRef.current !== null) {
      return;
    }

    itemMoveFrameRef.current = window.requestAnimationFrame(() => {
      itemMoveFrameRef.current = null;

      setEvents((current) => {
        const pending = itemMoveRef.current;
        if (!pending) {
          return current;
        }

        let didChange = false;
        const nextEvents = current.map((event) => {
          if (event.id !== pending.eventId) {
            return event;
          }

          didChange = true;
          return applyMoveWindow(event, pending.next);
        });

        if (!didChange) {
          return current;
        }

        return sortCalendarEvents(nextEvents);
      });
    });
  }, [eventById]);

  const flushQueuedItemMove = useCallback(() => {
    const queued = itemMoveRef.current;
    if (!queued) {
      return;
    }

    clearQueuedItemMove();
    if (areMoveWindowsEqual(queued.previous, queued.next)) {
      return;
    }

    commitMove({
      eventId: queued.eventId,
      previous: queued.previous,
      next: queued.next,
      recordUndo: true
    });
  }, [clearQueuedItemMove, commitMove]);

  const flushQueuedItemMoveRef = useRef(flushQueuedItemMove);
  useEffect(() => {
    flushQueuedItemMoveRef.current = flushQueuedItemMove;
  }, [flushQueuedItemMove]);

  const startItemDragSelectionBlock = useCallback(() => {
    if (isItemDragActiveRef.current) {
      return;
    }

    isItemDragActiveRef.current = true;
    timelinePanelRef.current?.classList.add("calendar-timeline-panel--item-dragging");
  }, []);

  const stopItemDragSelectionBlock = useCallback(() => {
    if (!isItemDragActiveRef.current) {
      return;
    }

    isItemDragActiveRef.current = false;
    timelinePanelRef.current?.classList.remove("calendar-timeline-panel--item-dragging");
  }, []);

  const handleItemMove = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["onItemMove"]>>(
    (itemId, dragTime, newGroupOrder) => {
      startItemDragSelectionBlock();

      const eventId = String(itemId);
      const group = groups[newGroupOrder];
      if (!group) {
        return;
      }

      if (eventId === "__draft-create__") {
        if (!draft) {
          return;
        }

        const duration = Math.max(MIN_EVENT_MS, draft.endsAt.getTime() - draft.startsAt.getTime());
        setDraft({
          location: group.id,
          startsAt: new Date(dragTime),
          endsAt: new Date(dragTime + duration)
        });
        return;
      }

      const event = eventById.get(eventId);
      if (!event) {
        return;
      }

      const duration = Math.max(MIN_EVENT_MS, getEventDuration(event));
      const startsAt = new Date(dragTime);
      const endsAt = new Date(dragTime + duration);

      stageItemMove(
        eventId,
        {
          location: group.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString()
        }
      );
    },
    [draft, eventById, groups, startItemDragSelectionBlock, stageItemMove]
  );

  useEffect(() => {
    const stopMoving = () => {
      stopItemDragSelectionBlock();
      flushQueuedItemMoveRef.current();
    };

    window.addEventListener("pointerup", stopMoving);
    window.addEventListener("pointercancel", stopMoving);
    window.addEventListener("blur", stopMoving);

    return () => {
      window.removeEventListener("pointerup", stopMoving);
      window.removeEventListener("pointercancel", stopMoving);
      window.removeEventListener("blur", stopMoving);
    };
  }, [stopItemDragSelectionBlock]);

  const handleItemResize = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["onItemResize"]>>(
    (itemId, resizeTime, edge) => {
      startItemDragSelectionBlock();

      const eventId = String(itemId);
      if (!edge) {
        return;
      }

      if (eventId === "__draft-create__") {
        if (!draft) {
          return;
        }

        const currentStart = draft.startsAt.getTime();
        const currentEnd = draft.endsAt.getTime();
        const startsAt = edge === "left" ? resizeTime : currentStart;
        const endsAt = edge === "right" ? resizeTime : currentEnd;

        if (endsAt - startsAt < MIN_EVENT_MS) {
          return;
        }

        setDraft({
          ...draft,
          startsAt: new Date(startsAt),
          endsAt: new Date(endsAt)
        });
        return;
      }

      const event = eventById.get(eventId);
      if (!event) {
        return;
      }

      const currentStart = new Date(event.starts_at).getTime();
      const currentEnd = new Date(event.ends_at).getTime();
      const startsAt = edge === "left" ? resizeTime : currentStart;
      const endsAt = edge === "right" ? resizeTime : currentEnd;

      if (endsAt - startsAt < MIN_EVENT_MS) {
        return;
      }

      stageItemMove(
        eventId,
        {
          location: event.location as ProcessCalendarLocation,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString()
        }
      );
  },
    [draft, eventById, stageItemMove, startItemDragSelectionBlock]
  );

  const handleCanvasDoubleClick = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["onCanvasDoubleClick"]>>(
    (groupId, time) => {
      const location = LOCATIONS.find((candidate) => candidate === groupId);
      if (!location) {
        return;
      }

      const startsAt = new Date(time);
      const endsAt = new Date(time + DEFAULT_EVENT_MS);
      openDraft({ location, startsAt, endsAt });
    },
    [openDraft]
  );

  const handleTimelineDoubleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isBlankTimelineTarget(event.target)) {
      return;
    }

    const pointerTarget = getTimelinePointerTarget(event);
    if (!pointerTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startsAt = new Date(pointerTarget.time);
    const endsAt = new Date(Math.min(pointerTarget.time + DEFAULT_EVENT_MS, timelineEnd));
    openDraft({ location: pointerTarget.location, startsAt, endsAt });
  }, [getTimelinePointerTarget, openDraft, timelineEnd]);

  const syncSelectionForm = useCallback((event: ProcessCalendarEventView | null) => {
    if (!event) {
      setActionMode(steps.length ? "step" : "manual");
      setSelectedStepId(steps[0]?.id ?? "");
      setManualAction("");
      setDescription("");
      setSelectedPersonIds([]);
      setError(null);
      setDraft(null);
      return;
    }

    setActionMode(event.process_step_id ? "step" : "manual");
    setSelectedStepId(event.process_step_id ?? steps[0]?.id ?? "");
    setManualAction(event.manual_action ?? "");
    setDescription(event.description ?? "");
    setSelectedPersonIds(event.people.map((person) => person.id));
    setSelectedEventId(event.id);
    setError(null);
    setDraft(null);
  }, [steps]);

  const clearSelectedEvent = useCallback(() => {
    syncSelectionForm(null);
  }, [syncSelectionForm]);

  const handleCanvasClick = useCallback(() => {
    clearSelectedEvent();
  }, [clearSelectedEvent]);

  const handleItemSelect = useCallback((itemId: Id) => {
    if (String(itemId) === "__draft-create__") {
      return;
    }

    const event = events.find((candidate) => candidate.id === String(itemId)) ?? null;
    if (!event) {
      clearSelectedEvent();
      return;
    }

    syncSelectionForm(event);
  }, [clearSelectedEvent, events, syncSelectionForm]);

  const handleTimelinePointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(".ww-timeline-item")) {
      startItemDragSelectionBlock();
    }

    if (event.button !== 0 || !isBlankTimelineTarget(event.target)) {
      return;
    }

    if (!event.shiftKey) {
      const timeline = timelineRef.current;
      if (!timeline) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      timelinePanelRef.current?.setPointerCapture?.(event.pointerId);
      timelinePanRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startStart: effectiveVisibleRange.start,
        startEnd: effectiveVisibleRange.end,
        moved: false
      };
      setTimelinePanPointerId(event.pointerId);
      setIsTimelinePanning(false);
      return;
    }

    const pointerTarget = getTimelinePointerTarget(event);
    if (!pointerTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const selection = {
      pointerId: event.pointerId,
      location: pointerTarget.location,
      anchorTime: pointerTarget.time,
      currentTime:
        pointerTarget.time + MIN_EVENT_MS <= timelineEnd
          ? pointerTarget.time + MIN_EVENT_MS
          : Math.max(timelineStart, pointerTarget.time - MIN_EVENT_MS)
    };

    setDraft(null);
    resetDraftForm();
    setActiveDraftDrag(selection);
  }, [
    effectiveVisibleRange.end,
    effectiveVisibleRange.start,
    getTimelinePointerTarget,
    startItemDragSelectionBlock,
    resetDraftForm,
    setActiveDraftDrag,
    timelineEnd,
    timelineStart
  ]);

  const moveResizeValidator = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["moveResizeValidator"]>>(
    (action, item, time, resizeEdge) => {
      const minTime = timelineStart;
      const maxTime = timelineEnd;

      if (action === "move") {
        const duration = Math.max(MIN_EVENT_MS, item.end_time - item.start_time);
        return clamp(time, minTime, maxTime - duration);
      }

      if (resizeEdge === "left") {
        return clamp(time, minTime, item.end_time - MIN_EVENT_MS);
      }

      return clamp(time, item.start_time + MIN_EVENT_MS, maxTime);
    },
    [timelineEnd, timelineStart]
  );

  const handleTimeChange = useCallback<OnTimeChange<CalendarTimelineItem, TimelineLocationGroup>>(
    (visibleTimeStart, visibleTimeEnd, updateScrollCanvas) => {
      const requestedSpan = visibleTimeEnd - visibleTimeStart;
      const maxSpan = timelineEnd - timelineStart;
      const currentSpan = visibleRange.end - visibleRange.start;
      const wasZoom = requestedSpan !== currentSpan;

      let nextStart = visibleTimeStart;
      let nextEnd = visibleTimeEnd;

      if (wasZoom && requestedSpan < maxSpan) {
        const previousCenter = (visibleRange.start + visibleRange.end) / 2;
        const halfSpan = requestedSpan / 2;
        nextStart = previousCenter - halfSpan;
        nextEnd = previousCenter + halfSpan;
      }

      syncVisibleRange(nextStart, nextEnd, updateScrollCanvas);
    },
    [visibleRange, syncVisibleRange, timelineEnd, timelineStart]
  );

  const handleTimelineWheelCapture = useCallback(
    (event: WheelEvent) => {
      const timeline = timelineRef.current;
      const panel = timelinePanelRef.current;
      if (!timeline || !panel) {
        return;
      }

      const isZoomGesture = event.ctrlKey || event.metaKey;
      const hasHorizontalIntent = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
      if (!isZoomGesture && !hasHorizontalIntent) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = timeline.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const cursorRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);

      startTransition(() => {
        setVisibleRange((previousRange) => {
          const span = previousRange.end - previousRange.start;

          if (isZoomGesture) {
            const zoomStep = 1 + clamp(Math.abs(event.deltaY) / 200, 0.05, 0.5);
            const nextSpan = clamp(
              event.deltaY > 0 ? span * zoomStep : span / zoomStep,
              MIN_ZOOM_MS,
              timelineEnd - timelineStart
            );
            const cursorTime = previousRange.start + span * cursorRatio;
            const normalized = clampVisibleWindow(
              cursorTime - nextSpan * cursorRatio,
              cursorTime + nextSpan * (1 - cursorRatio),
              timelineStart,
              timelineEnd
            );
            return {
              boundsStart: timelineStart,
              boundsEnd: timelineEnd,
              ...normalized
            };
          }

          const requestedStart = previousRange.start + (event.deltaX / rect.width) * span;
          const normalized = clampVisibleWindow(requestedStart, requestedStart + span, timelineStart, timelineEnd);
          return {
            boundsStart: timelineStart,
            boundsEnd: timelineEnd,
            ...normalized
          };
        });
      });
    },
    [timelineEnd, timelineStart]
  );

  useEffect(() => {
    const panel = timelinePanelRef.current;
    if (!panel) {
      return;
    }

    panel.addEventListener("wheel", handleTimelineWheelCapture, { capture: true, passive: false });

    return () => {
      panel.removeEventListener("wheel", handleTimelineWheelCapture, { capture: true });
    };
  }, [handleTimelineWheelCapture]);

  useEffect(() => {
    const panel = timelinePanelRef.current;
    if (!panel) {
      return;
    }

    const preventSwipeGesture = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) {
        event.preventDefault();
      }
    };

    panel.addEventListener("gesturestart", preventSwipeGesture, { passive: false });
    panel.addEventListener("gesturechange", preventSwipeGesture, { passive: false });
    panel.addEventListener("gestureend", preventSwipeGesture, { passive: false });

    return () => {
      panel.removeEventListener("gesturestart", preventSwipeGesture);
      panel.removeEventListener("gesturechange", preventSwipeGesture);
      panel.removeEventListener("gestureend", preventSwipeGesture);
    };
  }, []);

  useEffect(() => {
    const pending = timelineScrollSyncRef.current;
    if (!pending) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      pending.updateScrollCanvas(pending.start, pending.end);
      timelineScrollSyncRef.current = null;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [visibleRange]);

  const renderTimelineItem = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["itemRenderer"]>>(
    ({ item, itemContext, getItemProps, getResizeProps }) => {
      const resizeProps = getResizeProps();
      const { key, onPointerDown, onPointerUp, onPointerCancel, ...itemProps } = getItemProps({
        className: `ww-timeline-item ${item.toneClass} ${itemContext.selected ? "ww-timeline-item--selected" : ""}`
      }) as HTMLAttributes<HTMLDivElement> & {
        key?: React.Key;
      };

      const handleItemPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        startItemDragSelectionBlock();
        onPointerDown?.(event);
      };

      const handleItemPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        onPointerUp?.(event);
        stopItemDragSelectionBlock();
      };

      const handleItemPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
        onPointerCancel?.(event);
        stopItemDragSelectionBlock();
      };

      return (
        <div
          key={key}
          {...itemProps}
          onPointerDown={handleItemPointerDown}
          onPointerUp={handleItemPointerUp}
          onPointerCancel={handleItemPointerCancel}
        >
          {itemContext.useResizeHandle ? <div {...resizeProps.left} className="ww-timeline-resize ww-timeline-resize--left" /> : null}
          <div className="ww-timeline-item-content">
            {presentationMode === "wireframe" ? (
              <>
                <div className="ww-timeline-item-title-row">
                  <strong>{item.title}</strong>
                  {item.badgeLabel ? <span className="ww-timeline-item-badge">{item.badgeLabel}</span> : null}
                </div>
                {item.peopleLabel ? <span className="ww-timeline-item-person">{item.peopleLabel}</span> : null}
                <span className="ww-timeline-item-time">{item.timeLabel}</span>
                {item.descriptionLabel ? <span className="ww-timeline-item-description">{item.descriptionLabel}</span> : null}
              </>
            ) : (
              <>
                <strong>{item.title}</strong>
                <span>{item.peopleLabel || "Unassigned"}</span>
              </>
            )}
          </div>
          {itemContext.useResizeHandle ? <div {...resizeProps.right} className="ww-timeline-resize ww-timeline-resize--right" /> : null}
        </div>
      );
    },
    [presentationMode, startItemDragSelectionBlock, stopItemDragSelectionBlock]
  );

  function addPerson(person: ProcessCalendarPersonOption) {
    setSelectedPersonIds((current) => [...current, person.id]);
    setPersonQuery("");
  }

  function removePerson(personId: string) {
    setSelectedPersonIds((current) => current.filter((id) => id !== personId));
  }

  function saveDraft() {
    if (!draft) {
      return;
    }

    setError(null);

    if (persistenceMode === "local") {
      const createdEvent: ProcessCalendarEventView = {
        id: `local-${Date.now().toString(36)}`,
        process_template_id: processTemplateId,
        location: draft.location,
        starts_at: draft.startsAt.toISOString(),
        ends_at: draft.endsAt.toISOString(),
        process_step_id: actionMode === "step" && selectedStepId ? selectedStepId : null,
        manual_action: actionMode === "manual" ? manualAction.trim() || null : null,
        description: description.trim() || null,
        people: selectedPeopleForSave()
      };

      setEvents((current) => sortCalendarEvents([...current, createdEvent]));
      setDraft(null);
      setSelectedEventId(createdEvent.id);
      syncSelectionForm(createdEvent);
      return;
    }

    startTransition(async () => {
      const result = await createProcessCalendarEvent({
        processTemplateId,
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

      const createdEvent = result.data as ProcessCalendarEventView;
      setEvents((current) => sortCalendarEvents([...current, createdEvent]));
      setDraft(null);
      setSelectedEventId(createdEvent.id);
      syncSelectionForm(createdEvent);
    });
  }

  function saveSelectedEvent() {
    if (!selectedEvent) {
      return;
    }

    setError(null);

    if (persistenceMode === "local") {
      const updatedEvent: ProcessCalendarEventView = {
        ...selectedEvent,
        process_step_id: actionMode === "step" && selectedStepId ? selectedStepId : null,
        manual_action: actionMode === "manual" ? manualAction.trim() || null : null,
        description: description.trim() || null,
        people: selectedPeopleForSave()
      };

      syncSelectionForm(updatedEvent);
      setEvents((current) =>
        sortCalendarEvents(
          current.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
        )
      );
      return;
    }

    startTransition(async () => {
      const result = await updateProcessCalendarEvent({
        eventId: selectedEvent.id,
        processStepId: actionMode === "step" ? selectedStepId : null,
        manualAction: actionMode === "manual" ? manualAction : null,
        description,
        personIds: selectedPersonIds
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const updatedEvent = result.data as ProcessCalendarEventView;
      syncSelectionForm(updatedEvent);
      setEvents((current) =>
        sortCalendarEvents(
          current.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
        )
      );
    });
  }

  function deleteSelectedEvent() {
    if (!selectedEvent) {
      return;
    }

    setError(null);

    if (persistenceMode === "local") {
      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      clearSelectedEvent();
      return;
    }

    startTransition(async () => {
      const result = await deleteProcessCalendarEvent({ eventId: selectedEvent.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      clearSelectedEvent();
    });
  }

  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const lastMove = undoStackRef.current.pop();
      if (!lastMove) {
        return;
      }

      event.preventDefault();
      commitMove({
        eventId: lastMove.eventId,
        previous: lastMove.next,
        next: lastMove.previous,
        recordUndo: false
      });
    };

    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [commitMove]);

  useEffect(() => {
    if (!draftDragSelection) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const currentSelection = draftDragSelectionRef.current;
      if (!currentSelection || event.pointerId !== currentSelection.pointerId) {
        return;
      }

      if (!event.shiftKey) {
        finishDraftDrag(event);
        return;
      }

      event.preventDefault();
      const pointerTarget = getTimelinePointerTarget(event);
      if (!pointerTarget) {
        return;
      }

      setActiveDraftDrag({
        ...currentSelection,
        location: pointerTarget.location,
        currentTime: pointerTarget.time
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const currentSelection = draftDragSelectionRef.current;
      if (!currentSelection || event.pointerId !== currentSelection.pointerId) {
        return;
      }

      finishDraftDrag(event);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") {
        return;
      }

      finishDraftDrag(event);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerUp, { passive: false });
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [draftDragSelection, finishDraftDrag, getTimelinePointerTarget, setActiveDraftDrag]);

  useEffect(() => {
    if (timelinePanPointerId === null) {
      return;
    }

    const finishTimelinePan = (event?: PointerEvent) => {
      const pan = timelinePanRef.current;
      if (!pan || (event && event.pointerId !== pan.pointerId)) {
        return;
      }

      if (!pan.moved) {
        clearSelectedEvent();
      }

      if (event) {
        timelinePanelRef.current?.releasePointerCapture?.(event.pointerId);
      }

      timelinePanRef.current = null;
      setTimelinePanPointerId(null);
      setIsTimelinePanning(false);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pan = timelinePanRef.current;
      const timeline = timelineRef.current;
      if (!pan || event.pointerId !== pan.pointerId || !timeline) {
        return;
      }

      const rect = timeline.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const dragDistance = event.clientX - pan.startX;
      if (!pan.moved && Math.abs(dragDistance) < 4) {
        return;
      }

      event.preventDefault();
      pan.moved = true;
      setIsTimelinePanning(true);

      const span = pan.startEnd - pan.startStart;
      if (span >= timelineEnd - timelineStart) {
        startTransition(() => {
          setVisibleRange({
            boundsStart: timelineStart,
            boundsEnd: timelineEnd,
            start: timelineStart,
            end: timelineEnd
          });
        });
        return;
      }

      const timeDelta = (dragDistance / rect.width) * span;
      const nextStart = clamp(pan.startStart - timeDelta, timelineStart, timelineEnd - span);

      startTransition(() => {
        setVisibleRange({
          boundsStart: timelineStart,
          boundsEnd: timelineEnd,
          start: nextStart,
          end: nextStart + span
        });
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishTimelinePan);
    window.addEventListener("pointercancel", finishTimelinePan);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishTimelinePan);
      window.removeEventListener("pointercancel", finishTimelinePan);
    };
  }, [clearSelectedEvent, timelineEnd, timelinePanPointerId, timelineStart]);

  return (
    <div
      className={[
        "calendar-scheduler",
        "calendar-scheduler--timeline",
        presentationMode === "wireframe" ? "calendar-scheduler--wireframe" : undefined
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`calendar-timeline-panel ${isTimelinePanning ? "calendar-timeline-panel--panning" : ""}`}
        onDoubleClickCapture={handleTimelineDoubleClickCapture}
        onPointerDownCapture={handleTimelinePointerDownCapture}
        ref={timelinePanelRef}
      >
        <div className="calendar-timeline-toolbar">
          <p className="eyebrow">Schedule map</p>
          <p className="muted">
            {formatDateTime(new Date(timelineStart))} - {formatDateTime(new Date(timelineEnd))}
          </p>
        </div>

        <Timeline<CalendarTimelineItem, TimelineLocationGroup>
          canChangeGroup
          canMove
          canResize="both"
          className="ww-process-timeline"
          clickTolerance={5}
          defaultTimeEnd={timelineEnd}
          defaultTimeStart={timelineStart}
          dragSnap={SNAP_MS}
          groups={groups}
          itemHeightRatio={0.76}
          itemRenderer={renderTimelineItem}
          itemTouchSendsClick
          itemVerticalGap={presentationMode === "wireframe" ? 12 : 6}
          items={timelineItems}
          keys={TIMELINE_KEYS}
          lineHeight={presentationMode === "wireframe" ? 172 : 46}
          maxZoom={maxZoomMs}
          minZoom={MIN_ZOOM_MS}
          moveResizeValidator={moveResizeValidator}
          onCanvasClick={handleCanvasClick}
          onCanvasDoubleClick={handleCanvasDoubleClick}
          onItemClick={handleItemSelect}
          onItemMove={handleItemMove}
          onItemResize={handleItemResize}
          onItemSelect={handleItemSelect}
          onTimeChange={handleTimeChange}
          ref={setTimelineRef}
          selected={draft ? ["__draft-create__"] : selectedEventId ? [selectedEventId] : []}
          sidebarWidth={presentationMode === "wireframe" ? 136 : 132}
          verticalLineClassNamesForTime={timelineVerticalLineClassNames}
          stackItems
          timeSteps={{ second: 1, minute: 15, hour: headerScale.hourStep, day: 1, month: 1, year: 1 }}
          useResizeHandle
          visibleTimeEnd={effectiveVisibleRange.end}
          visibleTimeStart={effectiveVisibleRange.start}
        >
          <TimelineHeaders className="ww-timeline-headers">
            <SidebarHeader>
              {({ getRootProps }) => {
                const rootProps = getRootProps({ style: { color: "inherit" } }) as HTMLAttributes<HTMLDivElement> & {
                  className?: string;
                };

                return (
                  <div
                    {...rootProps}
                    className={[rootProps.className, "ww-timeline-sidebar-header"].filter(Boolean).join(" ")}
                  >
                    {presentationMode === "wireframe" ? "Sites" : "Location"}
                  </div>
                );
              }}
            </SidebarHeader>
            {presentationMode === "wireframe" ? (
              <DateHeader
                key="wireframe-day"
                labelFormat={createHeaderLabelFormatter("ddd D")}
                unit="day"
                intervalRenderer={createWireframeDayHeaderRenderer()}
              />
            ) : (
              <>
                <DateHeader
                  key={`primary-${headerScale.id}`}
                  labelFormat={headerScale.primaryLabelFormat}
                  unit={headerScale.primaryUnit}
                  intervalRenderer={createCurrentDayHeaderRenderer(headerScale.primaryUnit === "day")}
                />
                <DateHeader
                  key={`secondary-${headerScale.id}`}
                  labelFormat={headerScale.secondaryLabelFormat}
                  unit={headerScale.secondaryUnit}
                  intervalRenderer={createCurrentDayHeaderRenderer(headerScale.secondaryUnit === "day")}
                />
              </>
            )}
          </TimelineHeaders>
        </Timeline>
      </div>

      <aside
        className={[
          "calendar-inspector",
          presentationMode === "wireframe" ? "calendar-inspector--wireframe" : undefined,
          draft || selectedEvent || error ? "calendar-inspector--active" : "calendar-inspector--empty"
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Calendar event details"
      >
        <div className="calendar-filter-panel">
          <div className="calendar-filter-panel__header">
            <div>
              <p className="eyebrow">Show</p>
              <h3>Calendar filters</h3>
            </div>
            <button
              aria-expanded={isFilterPanelExpanded}
              className="calendar-filter-panel__toggle"
              type="button"
              onClick={() => setIsFilterPanelExpanded((expanded) => !expanded)}
            >
              {isFilterPanelExpanded ? "Compact" : "Expand"}
            </button>
          </div>

          {isFilterPanelExpanded ? (
            <>
              <div className="calendar-filter-group">
                <div className="calendar-filter-group__label">
                  <span>People</span>
                </div>
                <div className="calendar-filter-chip-list">
                  <button
                    aria-pressed={filterPersonIds.length === 0}
                    className={filterPersonIds.length === 0 ? "is-selected" : ""}
                    type="button"
                    onClick={() => setFilterPersonIds([])}
                  >
                    Everyone
                  </button>
                  {people.map((person) => (
                    <button
                      aria-pressed={filterPersonIds.includes(person.id)}
                      className={filterPersonIds.includes(person.id) ? "is-selected" : ""}
                      key={person.id}
                      type="button"
                      onClick={() => setFilterPersonIds((current) => toggleSelection(current, person.id))}
                    >
                      {person.display_name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="calendar-filter-group">
                <div className="calendar-filter-group__label">
                  <span>Process stage</span>
                </div>
                <div className="calendar-filter-chip-list">
                  <button
                    aria-pressed={filterStageIds.length === 0}
                    className={filterStageIds.length === 0 ? "is-selected" : ""}
                    type="button"
                    onClick={() => setFilterStageIds([])}
                  >
                    All stages
                  </button>
                  {stageFilterOptions.map((stage) => (
                    <button
                      aria-pressed={filterStageIds.includes(stage.id)}
                      className={filterStageIds.includes(stage.id) ? "is-selected" : ""}
                      key={stage.id}
                      type="button"
                      onClick={() => setFilterStageIds((current) => toggleSelection(current, stage.id))}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="calendar-filter-summary">
              <button type="button" onClick={() => setIsFilterPanelExpanded(true)}>
                <span>People</span>
                <strong>{personFilterSummary}</strong>
              </button>
              <button type="button" onClick={() => setIsFilterPanelExpanded(true)}>
                <span>Process stage</span>
                <strong>{stageFilterSummary}</strong>
              </button>
            </div>
          )}
        </div>

        {draft ? (
          <>
            <div className="calendar-inspector-header">
              <p className="eyebrow">New event</p>
              <h3>{draft.location}</h3>
              <p className="muted">{formatWindow(draft.startsAt, draft.endsAt)}</p>
            </div>

            <label className="field">
              <span>Action</span>
              <select
                value={actionMode === "step" ? selectedStepId : "__manual"}
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
              <label className="field">
                <span>Manual action</span>
                <input
                  value={manualAction}
                  onChange={(event) => setManualAction(event.target.value)}
                  placeholder="Poling"
                />
              </label>
            ) : null}

            <div className="field">
              <span>People</span>
              <div className="person-picker">
                <div className="person-chips">
                  {selectedPeople.map((person) => (
                    <button key={person.id} type="button" onClick={() => removePerson(person.id)}>
                      {person.display_name}
                    </button>
                  ))}
                </div>
                <input
                  value={personQuery}
                  onChange={(event) => setPersonQuery(event.target.value)}
                  onKeyDown={(event) => {
                    const firstAvailablePerson = filteredPeople.find((entry) => !entry.conflictReason)?.person;

                    if (event.key === "Enter" && firstAvailablePerson) {
                      event.preventDefault();
                      addPerson(firstAvailablePerson);
                    }
                  }}
                  placeholder="Type a name"
                />
                {personQuery.trim() ? (
                  <div className="person-suggestions">
                    {filteredPeople.map(({ person, conflictReason }) => (
                      <button
                        disabled={Boolean(conflictReason)}
                        key={person.id}
                        type="button"
                        title={conflictReason ?? undefined}
                        onClick={() => addPerson(person)}
                      >
                        <span>{person.display_name}</span>
                        {conflictReason ? <small>{conflictReason}</small> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <label className="field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="Notes, sample set, handoff details"
              />
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="calendar-inspector-actions">
              <button className="button button-primary" disabled={isPending} type="button" onClick={saveDraft}>
                Save event
              </button>
              <button className="button" type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </>
        ) : selectedEvent ? (
          <>
            <div className="calendar-inspector-header">
              <p className="eyebrow">Selected event</p>
              <h3>{eventLabel(selectedEvent, stepsById)}</h3>
              <p className="muted">
                {selectedEvent.location} · {formatWindow(new Date(selectedEvent.starts_at), new Date(selectedEvent.ends_at))}
              </p>
            </div>

            <label className="field">
              <span>Action</span>
              <select
                value={actionMode === "step" ? selectedStepId : "__manual"}
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
              <label className="field">
                <span>Manual action</span>
                <input
                  value={manualAction}
                  onChange={(event) => setManualAction(event.target.value)}
                  placeholder="Poling"
                />
              </label>
            ) : null}

            <div className="field">
              <span>People</span>
              <div className="person-picker">
                <div className="person-chips">
                  {selectedPeople.map((person) => (
                    <button key={person.id} type="button" onClick={() => removePerson(person.id)}>
                      {person.display_name}
                    </button>
                  ))}
                </div>
                <input
                  value={personQuery}
                  onChange={(event) => setPersonQuery(event.target.value)}
                  onKeyDown={(event) => {
                    const firstAvailablePerson = filteredPeople.find((entry) => !entry.conflictReason)?.person;

                    if (event.key === "Enter" && firstAvailablePerson) {
                      event.preventDefault();
                      addPerson(firstAvailablePerson);
                    }
                  }}
                  placeholder="Type a name"
                />
                {personQuery.trim() ? (
                  <div className="person-suggestions">
                    {filteredPeople.map(({ person, conflictReason }) => (
                      <button
                        disabled={Boolean(conflictReason)}
                        key={person.id}
                        type="button"
                        title={conflictReason ?? undefined}
                        onClick={() => addPerson(person)}
                      >
                        <span>{person.display_name}</span>
                        {conflictReason ? <small>{conflictReason}</small> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <label className="field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="Notes, sample set, handoff details"
              />
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="calendar-inspector-actions">
              <button className="button button-primary" disabled={isPending} type="button" onClick={saveSelectedEvent}>
                Save event
              </button>
              <button
                className="button"
                type="button"
                onClick={() => syncSelectionForm(selectedEvent)}
              >
                Cancel
              </button>
              <button className="button button-danger" disabled={isPending} type="button" onClick={deleteSelectedEvent}>
                Delete event
              </button>
            </div>
          </>
        ) : (
          <div className="calendar-inspector-empty">
            <p className="eyebrow">Calendar</p>
            <h3>No event selected</h3>
            <p className="muted">Choose a bar to inspect it.</p>
            {error ? <p className="form-error">{error}</p> : null}
          </div>
        )}
      </aside>
    </div>
  );
}
