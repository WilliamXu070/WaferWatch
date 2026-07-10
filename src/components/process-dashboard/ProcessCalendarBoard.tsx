"use client";

import {
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
import Timeline, {
  DateHeader,
  SidebarHeader,
  TimelineHeaders,
  type Id,
  type OnTimeChange,
  type ReactCalendarTimelineProps
} from "react-calendar-timeline";
import { flushSync } from "react-dom";
import { WaferDiePreview, type WaferDiePreviewModel } from "@/components/wafer-die-preview";
import {
  createProcessCalendarEvent,
  moveProcessCalendarEvent,
  updateProcessCalendarEvent
} from "@/features/calendar/actions";
import type {
  ProcessCalendarEventView,
  ProcessCalendarLocation,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";
import { CalendarEventEditor } from "./calendar/CalendarEventEditor";
import { CalendarFilterPanel } from "./calendar/CalendarFilterPanel";
import { renderCalendarTimelineItem } from "./calendar/CalendarTimelineItemRenderer";
import {
  DAY_MS,
  DEFAULT_EVENT_MS,
  DEFAULT_VISIBLE_RANGE_DAYS,
  END_MINUTE,
  LOCATIONS,
  LOCATION_REGIONS,
  MANUAL_STAGE_FILTER_ID,
  MAX_WEEK_ZOOM_MS,
  MAX_WIREFRAME_ZOOM_MS,
  MIN_EVENT_MS,
  MIN_ZOOM_MS,
  SNAP_MS,
  START_MINUTE,
  TIMELINE_KEYS,
  TRAVEL_BUFFER_MS
} from "./calendar/constants";
import {
  addDays,
  buildDateAtMinute,
  clamp,
  clampVisibleWindow,
  createCurrentDayHeaderRenderer,
  createWireframeHeaderRenderer,
  formatDateTime,
  formatTimelineItemWindow,
  formatWindow,
  getCurrentWeekStart,
  getDayAndHour,
  getHeaderScale,
  getWireframeHeaderScale,
  isCurrentDay,
  snapTime
} from "./calendar/date-helpers";
import {
  applyMoveWindow,
  areMoveWindowsEqual,
  buildWireframePeopleSummary,
  eventLabel,
  eventTone,
  getEventDuration,
  getWireframeEventBadge,
  getWireframeEventTitle,
  intervalsOverlap,
  isBlankTimelineTarget,
  locationTone,
  draftFromSelection,
  sortCalendarEvents,
  toDisplayName,
  toMoveWindow
} from "./calendar/event-helpers";
import type {
  ActionMode,
  CalendarTimelineItem,
  CalendarTimelineRef,
  DraftDragSelection,
  DraftEvent,
  MoveWindow,
  PendingTimelineMove,
  ProcessCalendarBoardProps,
  ProcessCalendarWaferOption,
  ProcessStepOption,
  StageFilterId,
  TimelineLocationGroup,
  TimelinePanState
} from "./calendar/types";

type CalendarOptionPayload = {
  steps?: ProcessStepOption[];
  wafers?: ProcessCalendarWaferOption[];
};

const PROCESS_TYPE_ACTION_LABEL = "Process type";

function getActionModeForEvent(event: ProcessCalendarEventView | null, steps: ProcessStepOption[]): ActionMode {
  if (event?.process_step_id) {
    return "step";
  }

  if (event?.manual_action === PROCESS_TYPE_ACTION_LABEL) {
    return "process";
  }

  return steps.length ? "step" : "manual";
}

function getManualActionForMode(actionMode: ActionMode, manualAction: string) {
  if (actionMode === "process") {
    return PROCESS_TYPE_ACTION_LABEL;
  }

  return actionMode === "manual" ? manualAction : null;
}

export function ProcessCalendarBoard({
  processTemplateId,
  calendarStartDate,
  days,
  steps: initialSteps,
  wafers: initialWafers = [],
  people,
  initialEvents,
  initialVisibleStartDate = calendarStartDate,
  persistenceMode = "server",
  presentationMode = "default",
  canEdit = true
}: ProcessCalendarBoardProps) {
  const [events, setEvents] = useState(initialEvents);
  const [liveSteps, setLiveSteps] = useState<ProcessStepOption[]>(() => [...initialSteps]);
  const [liveWafers, setLiveWafers] = useState<ProcessCalendarWaferOption[]>(() => [...initialWafers]);
  const initialSelection = presentationMode === "wireframe" ? null : initialEvents[0] ?? null;
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialSelection?.id ?? null);
  const [previewEventId, setPreviewEventId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(
    initialSelection ? getActionModeForEvent(initialSelection, initialSteps) : initialSteps.length ? "step" : "manual"
  );
  const [selectedStepId, setSelectedStepId] = useState(initialSelection?.process_step_id ?? initialSteps[0]?.id ?? "");
  const [selectedWaferId, setSelectedWaferId] = useState(initialSelection?.wafer_id ?? "");
  const [manualAction, setManualAction] = useState(
    initialSelection?.manual_action ?? (initialSelection?.process_step_id ? "" : initialSelection?.process_step_name_snapshot ?? "")
  );
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
  const isShiftPressedRef = useRef(false);
  const selectedEventIdRef = useRef<string | null>(initialSelection?.id ?? null);
  const suppressedItemSelectionIdRef = useRef<string | null>(null);
  const ignoreStaleItemSelectionUntilRef = useRef(0);
  const ignoreBlankCalendarClickUntilRef = useRef(0);
  const lastTimelineTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const itemMoveRef = useRef<PendingTimelineMove | null>(null);
  const itemMoveFrameRef = useRef<number | null>(null);
  const [timelinePanPointerId, setTimelinePanPointerId] = useState<number | null>(null);
  const [isTimelinePanning, setIsTimelinePanning] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  const refreshCalendarOptions = useCallback(async () => {
    if (persistenceMode === "local") {
      return;
    }

    try {
      const response = await fetch(`/api/processes/${processTemplateId}/calendar/options`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      const payload = (await response.json()) as CalendarOptionPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load process calendar options.");
      }

      const nextSteps = Array.isArray(payload.steps) ? payload.steps : [];
      const nextWafers = Array.isArray(payload.wafers) ? payload.wafers : [];
      const nextStepIds = new Set(nextSteps.map((step) => step.id));
      const nextWaferIds = new Set(nextWafers.map((wafer) => wafer.id));

      setLiveSteps(nextSteps);
      setLiveWafers(nextWafers);
      setSelectedStepId((current) => (current && nextStepIds.has(current) ? current : nextSteps[0]?.id ?? ""));
      setSelectedWaferId((current) => (current && !nextWaferIds.has(current) ? "" : current));
      setActionMode((current) => (current === "step" && nextSteps.length === 0 ? "manual" : current));
    } catch {
      // Keep the last known options usable if a background refresh fails.
    }
  }, [persistenceMode, processTemplateId]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refreshCalendarOptions();
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [refreshCalendarOptions]);

  useEffect(() => {
    const refreshOnFocus = () => {
      void refreshCalendarOptions();
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [refreshCalendarOptions]);

  const startDate = useMemo(() => new Date(`${calendarStartDate}T00:00:00`), [calendarStartDate]);
  const timelineStart = useMemo(() => buildDateAtMinute(startDate, START_MINUTE).getTime(), [startDate]);
  const timelineEnd = useMemo(
    () => buildDateAtMinute(addDays(startDate, Math.max(0, days - 1)), END_MINUTE).getTime(),
    [days, startDate]
  );
  const maxAllowedZoomMs = presentationMode === "wireframe" ? MAX_WIREFRAME_ZOOM_MS : MAX_WEEK_ZOOM_MS;
  const maxZoomMs = useMemo(
    () => Math.min(maxAllowedZoomMs, Math.max(1, timelineEnd - timelineStart)),
    [maxAllowedZoomMs, timelineEnd, timelineStart]
  );

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateCompactViewport = () => setIsCompactViewport(mediaQuery.matches);

    updateCompactViewport();
    mediaQuery.addEventListener("change", updateCompactViewport);

    return () => mediaQuery.removeEventListener("change", updateCompactViewport);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        isShiftPressedRef.current = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        isShiftPressedRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);


  const initialVisibleWindow = useMemo(() => {
    const requestedDate = new Date(`${initialVisibleStartDate}T00:00:00`);
    const requestedStart = Number.isNaN(requestedDate.getTime())
      ? getCurrentWeekStart(new Date())
      : buildDateAtMinute(requestedDate, START_MINUTE).getTime();
    const requestedSpanMs = DEFAULT_VISIBLE_RANGE_DAYS * DAY_MS;

    return clampVisibleWindow(
      requestedStart,
      requestedStart + requestedSpanMs,
      timelineStart,
      timelineEnd,
      maxZoomMs
    );
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
      const normalized = clampVisibleWindow(nextStart, nextEnd, timelineStart, timelineEnd, maxZoomMs);
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
    [maxZoomMs, timelineEnd, timelineStart]
  );
  const headerScale = useMemo(
    () => getHeaderScale(effectiveVisibleRange.end - effectiveVisibleRange.start),
    [effectiveVisibleRange.end, effectiveVisibleRange.start]
  );
  const wireframeHeaderScale = useMemo(
    () => getWireframeHeaderScale(effectiveVisibleRange.end - effectiveVisibleRange.start),
    [effectiveVisibleRange.end, effectiveVisibleRange.start]
  );
  const timelineVerticalLineClassNames = useCallback(
    (lineStart: number) => {
      const lineTime = getDayAndHour(lineStart);
      return [
        isCurrentDay(lineStart) ? "ww-timeline-vline-today" : undefined,
        [0, 6].includes(lineTime.day) ? "ww-timeline-vline-weekend" : undefined,
        lineTime.hour === 12 ? "ww-timeline-vline-midday" : undefined
      ].filter(Boolean) as string[];
    },
    []
  );

  const stepsById = useMemo(() => new Map(liveSteps.map((step) => [step.id, step.name])), [liveSteps]);
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
      ...liveSteps.map((step) => ({ id: step.id as StageFilterId, name: step.name })),
      { id: MANUAL_STAGE_FILTER_ID as StageFilterId, name: "Manual" }
    ],
    [liveSteps]
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
  const previewEvent = previewEventId ? events.find((event) => event.id === previewEventId) ?? null : null;
  const previewWafer = previewEvent?.wafer_id
    ? liveWafers.find((wafer) => wafer.id === previewEvent.wafer_id) ?? null
    : null;
  const eventHandlerNames = previewEvent?.people.map((person) => person.display_name).join(", ") || null;
  const waferPreview: WaferDiePreviewModel | null = previewEvent?.wafer_id
    ? {
        processId: processTemplateId,
        waferId: previewEvent.wafer_id,
        waferCode: previewWafer?.wafer_code ?? previewEvent.wafer?.wafer_code ?? "Wafer",
        dieLabel: previewWafer?.die_label ?? null,
        stepLabel: previewWafer?.current_step_name ?? previewEvent.process_step_name_snapshot ?? previewEvent.manual_action,
        handlerName: previewWafer?.current_handler_name ?? eventHandlerNames
      }
    : null;
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
        const waferLabel = event.wafer?.wafer_code ?? null;
        const descriptionLabel = [
          waferLabel ? `Wafer ${waferLabel}` : null,
          event.description && event.description !== displayTitle ? event.description : null
        ].filter(Boolean).join(" · ") || undefined;
        const startsAt = new Date(event.starts_at);
        const endsAt = new Date(event.ends_at);
        const peopleLabel = event.people
          .map((person) => presentationMode === "wireframe" ? toDisplayName(person.display_name) : person.display_name)
          .join(", ");
        const wireframePeopleSummary =
          presentationMode === "wireframe"
            ? buildWireframePeopleSummary(event.people.map((person) => toDisplayName(person.display_name)))
            : peopleLabel;

        return {
          id: event.id,
          group: event.location as ProcessCalendarLocation,
          title: displayTitle,
          badgeLabel: getWireframeEventBadge(event, presentationMode),
          descriptionLabel,
          event,
          peopleLabel: wireframePeopleSummary,
          timeLabel: formatTimelineItemWindow(startsAt, endsAt, presentationMode),
          toneClass:
            presentationMode === "wireframe"
              ? locationTone(event.location as ProcessCalendarLocation)
              : eventTone(label, presentationMode),
          start_time: startsAt.getTime(),
          end_time: endsAt.getTime(),
          canMove: canEdit,
          canChangeGroup: canEdit,
          canResize: canEdit ? "both" : false,
          height: presentationMode === "wireframe" ? (isCompactViewport ? 60 : 84) : 30
        };
      });

      if (canEdit && (draft || draftDragSelection)) {
        const draftWindow = draftDragSelection
          ? draftFromSelection(draftDragSelection, timelineStart, timelineEnd)
          : draft;

        if (!draftWindow) {
          return items;
        }

        items.push({
          id: "__draft-create__",
          group: draftWindow.location,
          title: "New event",
          descriptionLabel: draftDragSelection ? "Release to place" : undefined,
          peopleLabel: draftDragSelection ? "No one" : "Draft",
          timeLabel: formatTimelineItemWindow(draftWindow.startsAt, draftWindow.endsAt, presentationMode),
          toneClass: `ww-timeline-item--draft ${draftDragSelection ? "ww-timeline-item--draft-active" : ""}`,
          start_time: draftWindow.startsAt.getTime(),
          end_time: draftWindow.endsAt.getTime(),
          canMove: !draftDragSelection,
          canChangeGroup: !draftDragSelection,
          canResize: draftDragSelection ? false : "both",
          height: presentationMode === "wireframe" ? (isCompactViewport ? 60 : 84) : 30,
          isDraft: true
        });
      }

      return items;
    },
    [canEdit, draft, draftDragSelection, isCompactViewport, presentationMode, stepsById, timelineEnd, timelineStart, visibleEvents]
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
    setActionMode(liveSteps.length ? "step" : "manual");
    setSelectedStepId(liveSteps[0]?.id ?? "");
    setSelectedWaferId("");
    setManualAction("");
    setDescription("");
    setSelectedPersonIds(people[0]?.id ? [people[0].id] : []);
    setPersonQuery("");
  }, [liveSteps, people]);

  const openDraft = useCallback((nextDraft: DraftEvent) => {
    if (!canEdit) {
      return;
    }

    void refreshCalendarOptions();
    resetDraftForm();
    setDraft(nextDraft);
  }, [canEdit, refreshCalendarOptions, resetDraftForm]);

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

  const setTimelineRef = useCallback((instance: CalendarTimelineRef | null) => {
    timelineRef.current = instance;
  }, []);

  const setActiveDraftDrag = useCallback((selection: DraftDragSelection | null) => {
    draftDragSelectionRef.current = selection;
    setDraftDragSelection(selection);
  }, []);

  const finishDraftDrag = useCallback((event?: PointerEvent | KeyboardEvent) => {
    const currentSelection = draftDragSelectionRef.current;
    if (!currentSelection) {
      return;
    }

    event?.preventDefault();
    ignoreBlankCalendarClickUntilRef.current = Date.now() + 500;
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
      if (!canEdit) {
        return;
      }

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
    [canEdit, draft, eventById, groups, startItemDragSelectionBlock, stageItemMove]
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
      if (!canEdit) {
        return;
      }

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
    [canEdit, draft, eventById, stageItemMove, startItemDragSelectionBlock]
  );

  const openDefaultDraft = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const start = clamp(
      snapTime(effectiveVisibleRange.start + 2 * 60 * 60 * 1000),
      timelineStart,
      timelineEnd - DEFAULT_EVENT_MS
    );
    const end = Math.min(start + DEFAULT_EVENT_MS, timelineEnd);

    openDraft({
      location: groups[0]?.id ?? "McMaster",
      startsAt: new Date(start),
      endsAt: new Date(end)
    });
  }, [canEdit, effectiveVisibleRange.start, groups, openDraft, timelineEnd, timelineStart]);

  const handleTimelineDoubleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!canEdit) {
      return;
    }

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
  }, [canEdit, getTimelinePointerTarget, openDraft, timelineEnd]);

  const syncSelectionForm = useCallback((event: ProcessCalendarEventView | null) => {
    void refreshCalendarOptions();

    if (!event) {
      selectedEventIdRef.current = null;
      setSelectedEventId(null);
      setActionMode(liveSteps.length ? "step" : "manual");
      setSelectedStepId(liveSteps[0]?.id ?? "");
      setSelectedWaferId("");
      setManualAction("");
      setDescription("");
      setSelectedPersonIds([]);
      setError(null);
      setDraft(null);
      setPreviewEventId(null);
      return;
    }

    setActionMode(getActionModeForEvent(event, liveSteps));
    setSelectedStepId(event.process_step_id ?? liveSteps[0]?.id ?? "");
    setSelectedWaferId(event.wafer_id ?? "");
    setManualAction(event.manual_action ?? (event.process_step_id ? "" : event.process_step_name_snapshot ?? ""));
    setDescription(event.description ?? "");
    setSelectedPersonIds(event.people.map((person) => person.id));
    selectedEventIdRef.current = event.id;
    setSelectedEventId(event.id);
    setError(null);
    setDraft(null);
  }, [liveSteps, refreshCalendarOptions]);

  const clearSelectedEvent = useCallback(() => {
    syncSelectionForm(null);
  }, [syncSelectionForm]);

  const clearSelectedEventFromBlankCanvas = useCallback(() => {
    if (Date.now() < ignoreBlankCalendarClickUntilRef.current) {
      return;
    }

    suppressedItemSelectionIdRef.current = selectedEventIdRef.current;
    ignoreStaleItemSelectionUntilRef.current = Date.now() + 1500;
    flushSync(() => {
      clearSelectedEvent();
    });
  }, [clearSelectedEvent]);

  const clearSelectedEventAfterBlankClick = useCallback(() => {
    if (Date.now() < ignoreBlankCalendarClickUntilRef.current) {
      return;
    }

    suppressedItemSelectionIdRef.current = selectedEventIdRef.current;
    ignoreStaleItemSelectionUntilRef.current = Date.now() + 1500;
    flushSync(() => {
      clearSelectedEvent();
    });
    window.setTimeout(() => {
      flushSync(() => {
        clearSelectedEvent();
      });
    }, 0);
  }, [clearSelectedEvent]);

  const handleCanvasClick = useCallback(() => {
    clearSelectedEventAfterBlankClick();
  }, [clearSelectedEventAfterBlankClick]);

  const handleItemSelect = useCallback((itemId: Id) => {
    const nextItemId = String(itemId);

    if (
      nextItemId === suppressedItemSelectionIdRef.current &&
      Date.now() < ignoreStaleItemSelectionUntilRef.current
    ) {
      return;
    }

    if (nextItemId === "__draft-create__") {
      return;
    }

    const event = events.find((candidate) => candidate.id === nextItemId) ?? null;
    if (!event) {
      clearSelectedEvent();
      return;
    }

    syncSelectionForm(event);
    setPreviewEventId(event.wafer_id ? event.id : null);
  }, [clearSelectedEvent, events, syncSelectionForm]);

  const handleItemDeselect = useCallback(() => {
    if (Date.now() < ignoreBlankCalendarClickUntilRef.current) {
      return;
    }

    clearSelectedEvent();
  }, [clearSelectedEvent]);

  const handleTimelinePointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(".ww-timeline-item")) {
      startItemDragSelectionBlock();
    }

    if (event.button === 0 && event.target instanceof Element && event.target.closest(".rct-sidebar-row")) {
      clearSelectedEventFromBlankCanvas();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.button !== 0 || !isBlankTimelineTarget(event.target)) {
      return;
    }

    if (canEdit && event.pointerType !== "touch" && (event.shiftKey || isShiftPressedRef.current)) {
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
      return;
    }

    if (canEdit && event.pointerType === "touch") {
      const now = Date.now();
      const lastTap = lastTimelineTouchTapRef.current;
      const tapDistance = lastTap
        ? Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y)
        : Number.POSITIVE_INFINITY;
      const isDoubleTap = Boolean(lastTap && now - lastTap.time <= 360 && tapDistance <= 28);

      if (isDoubleTap) {
        lastTimelineTouchTapRef.current = null;

        const pointerTarget = getTimelinePointerTarget(event);
        if (!pointerTarget) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const startsAt = new Date(pointerTarget.time);
        const endsAt = new Date(Math.min(pointerTarget.time + DEFAULT_EVENT_MS, timelineEnd));
        openDraft({ location: pointerTarget.location, startsAt, endsAt });
        return;
      }

      lastTimelineTouchTapRef.current = {
        time: now,
        x: event.clientX,
        y: event.clientY
      };
    } else {
      lastTimelineTouchTapRef.current = null;
    }

    clearSelectedEventFromBlankCanvas();
    event.stopPropagation();
    if (event.pointerType !== "touch") {
      event.preventDefault();
    }
    timelinePanelRef.current?.setPointerCapture?.(event.pointerId);
    timelinePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerType: event.pointerType,
      startStart: effectiveVisibleRange.start,
      startEnd: effectiveVisibleRange.end,
      moved: false
    };
    setTimelinePanPointerId(event.pointerId);
    setIsTimelinePanning(false);
  }, [
    effectiveVisibleRange.start,
    effectiveVisibleRange.end,
    clearSelectedEventFromBlankCanvas,
    getTimelinePointerTarget,
    openDraft,
    resetDraftForm,
    setActiveDraftDrag,
    startItemDragSelectionBlock,
    canEdit,
    timelineEnd,
    timelineStart
  ]);

  const handleTimelineClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(".ww-timeline-item")) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".rct-sidebar-row")) {
      clearSelectedEventAfterBlankClick();
      return;
    }

    if (isBlankTimelineTarget(event.target)) {
      clearSelectedEventAfterBlankClick();
    }
  }, [clearSelectedEventAfterBlankClick]);

  const handleTimelineNativeClickCapture = useCallback((event: MouseEvent) => {
    const panel = timelinePanelRef.current;
    if (
      !panel ||
      !(event.target instanceof Node) ||
      (event.target !== panel && !panel.contains(event.target))
    ) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".ww-timeline-item")) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".rct-sidebar-row")) {
      clearSelectedEventAfterBlankClick();
      return;
    }

    if (isBlankTimelineTarget(event.target)) {
      clearSelectedEventAfterBlankClick();
    }
  }, [clearSelectedEventAfterBlankClick]);

  useEffect(() => {
    document.addEventListener("click", handleTimelineNativeClickCapture, { capture: true });

    return () => {
      document.removeEventListener("click", handleTimelineNativeClickCapture, { capture: true });
    };
  }, [handleTimelineNativeClickCapture]);

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
      const targetSpan = clamp(requestedSpan, MIN_ZOOM_MS, maxZoomMs);
      const currentSpan = visibleRange.end - visibleRange.start;
      const wasZoom = targetSpan !== currentSpan;

      let nextStart = visibleTimeStart;
      let nextEnd = visibleTimeEnd;

      if (wasZoom) {
        const previousCenter = (visibleRange.start + visibleRange.end) / 2;
        const halfSpan = targetSpan / 2;
        nextStart = previousCenter - halfSpan;
        nextEnd = previousCenter + halfSpan;
      }

      syncVisibleRange(nextStart, nextEnd, updateScrollCanvas);
    },
    [visibleRange, syncVisibleRange, maxZoomMs]
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
              maxZoomMs
            );
            const cursorTime = previousRange.start + span * cursorRatio;
            const normalized = clampVisibleWindow(
              cursorTime - nextSpan * cursorRatio,
              cursorTime + nextSpan * (1 - cursorRatio),
              timelineStart,
              timelineEnd,
              maxZoomMs
            );
            return {
              boundsStart: timelineStart,
              boundsEnd: timelineEnd,
              ...normalized
            };
          }

          const requestedStart = previousRange.start + (event.deltaX / rect.width) * span;
          const normalized = clampVisibleWindow(requestedStart, requestedStart + span, timelineStart, timelineEnd, maxZoomMs);
          return {
            boundsStart: timelineStart,
            boundsEnd: timelineEnd,
            ...normalized
          };
        });
      });
    },
    [maxZoomMs, timelineEnd, timelineStart]
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
    (rendererProps) => renderCalendarTimelineItem({
      draft,
      presentationMode,
      selectedEventId,
      suppressedItemSelectionIdRef,
      ignoreStaleItemSelectionUntilRef,
      startItemDragSelectionBlock,
      stopItemDragSelectionBlock,
      rendererProps
    }),
    [draft, presentationMode, selectedEventId, startItemDragSelectionBlock, stopItemDragSelectionBlock]
  );

  function addPerson(person: ProcessCalendarPersonOption) {
    setSelectedPersonIds((current) => [...current, person.id]);
    setPersonQuery("");
  }

  function removePerson(personId: string) {
    setSelectedPersonIds((current) => current.filter((id) => id !== personId));
  }

  function selectedStepSnapshot() {
    return actionMode === "step" && selectedStepId ? stepsById.get(selectedStepId) ?? null : null;
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
        wafer_id: selectedWaferId || null,
        wafer: liveWafers.find((wafer) => wafer.id === selectedWaferId) ?? null,
        process_step_name_snapshot: selectedStepSnapshot(),
        manual_action: getManualActionForMode(actionMode, manualAction)?.trim() || null,
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
        waferId: selectedWaferId || null,
        manualAction: getManualActionForMode(actionMode, manualAction),
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
        wafer_id: selectedWaferId || null,
        wafer: liveWafers.find((wafer) => wafer.id === selectedWaferId) ?? null,
        process_step_name_snapshot: selectedStepSnapshot(),
        manual_action: getManualActionForMode(actionMode, manualAction)?.trim() || null,
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
        waferId: selectedWaferId || null,
        manualAction: getManualActionForMode(actionMode, manualAction),
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

      if (!(event.shiftKey || isShiftPressedRef.current)) {
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
        const panel = timelinePanelRef.current;
        if (panel?.hasPointerCapture?.(event.pointerId)) {
          panel.releasePointerCapture(event.pointerId);
        }
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
      const verticalDistance = event.clientY - pan.startY;
      if (!pan.moved && Math.abs(dragDistance) < 4) {
        return;
      }

      if (
        pan.pointerType === "touch" &&
        !pan.moved &&
        Math.abs(verticalDistance) > Math.abs(dragDistance)
      ) {
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
        onClickCapture={handleTimelineClickCapture}
        onDoubleClickCapture={handleTimelineDoubleClickCapture}
        onPointerDownCapture={handleTimelinePointerDownCapture}
        ref={timelinePanelRef}
      >
        <div className="calendar-timeline-toolbar">
          <div>
            <p className="eyebrow">Schedule map</p>
            <p className="muted">
              {formatDateTime(new Date(effectiveVisibleRange.start))} -{" "}
              {formatDateTime(new Date(effectiveVisibleRange.end))}
            </p>
          </div>
          {canEdit ? (
            <button type="button" className="button button-primary calendar-new-event-button" onClick={openDefaultDraft}>
              New event
            </button>
          ) : null}
        </div>

        <Timeline<CalendarTimelineItem, TimelineLocationGroup>
          canChangeGroup={canEdit}
          canMove={canEdit}
          canResize={canEdit ? "both" : false}
          className="ww-process-timeline"
          clickTolerance={5}
          defaultTimeEnd={timelineEnd}
          defaultTimeStart={timelineStart}
          dragSnap={SNAP_MS}
          groups={groups}
          itemHeightRatio={0.76}
          itemRenderer={renderTimelineItem}
          itemTouchSendsClick
          itemVerticalGap={presentationMode === "wireframe" ? (isCompactViewport ? 6 : 12) : 6}
          items={timelineItems}
          keys={TIMELINE_KEYS}
          lineHeight={presentationMode === "wireframe" ? (isCompactViewport ? 88 : 172) : 46}
          maxZoom={maxZoomMs}
          minZoom={MIN_ZOOM_MS}
          moveResizeValidator={moveResizeValidator}
          onCanvasClick={handleCanvasClick}
          onItemClick={handleItemSelect}
          onItemDeselect={handleItemDeselect}
          onItemMove={handleItemMove}
          onItemResize={handleItemResize}
          onItemSelect={handleItemSelect}
          onTimeChange={handleTimeChange}
          ref={setTimelineRef}
          selected={draft ? ["__draft-create__"] : selectedEventId ? [selectedEventId] : []}
          sidebarWidth={presentationMode === "wireframe" ? (isCompactViewport ? 78 : 136) : 132}
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
              <>
                <DateHeader
                  key={`wireframe-${wireframeHeaderScale.id}`}
                  labelFormat={wireframeHeaderScale.labelFormat}
                  unit={wireframeHeaderScale.unit}
                  intervalRenderer={createWireframeHeaderRenderer(wireframeHeaderScale.id)}
                />
                {headerScale.secondaryUnit !== "day" ? (
                  <DateHeader
                    key={`wireframe-sub-${headerScale.id}`}
                    labelFormat={headerScale.secondaryLabelFormat}
                    unit={headerScale.secondaryUnit}
                    intervalRenderer={createCurrentDayHeaderRenderer(false)}
                  />
                ) : null}
              </>
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
        <CalendarFilterPanel
          people={people}
          filterPersonIds={filterPersonIds}
          filterStageIds={filterStageIds}
          isExpanded={isFilterPanelExpanded}
          personFilterSummary={personFilterSummary}
          stageFilterSummary={stageFilterSummary}
          stageFilterOptions={stageFilterOptions}
          onExpandedChange={setIsFilterPanelExpanded}
          onPersonFilterChange={setFilterPersonIds}
          onStageFilterChange={setFilterStageIds}
        />

          <CalendarEventEditor
            actionMode={actionMode}
            canEdit={canEdit}
            description={description}
          draft={draft}
          error={error}
          filteredPeople={filteredPeople}
          isPending={isPending}
          manualAction={manualAction}
          personQuery={personQuery}
          selectedEvent={selectedEvent}
          selectedPeople={selectedPeople}
          selectedStepId={selectedStepId}
          selectedWaferId={selectedWaferId}
          steps={liveSteps}
          wafers={liveWafers}
          stepsById={stepsById}
          onActionModeChange={setActionMode}
          onAddPerson={addPerson}
          onCancelDraft={() => setDraft(null)}
          onDescriptionChange={setDescription}
          onManualActionChange={setManualAction}
          onPersonQueryChange={setPersonQuery}
          onRemovePerson={removePerson}
          onResetSelectedEvent={syncSelectionForm}
          onSaveDraft={saveDraft}
          onSaveSelectedEvent={saveSelectedEvent}
          onSelectedStepIdChange={setSelectedStepId}
          onSelectedWaferIdChange={setSelectedWaferId}
        />
      </aside>
      <WaferDiePreview preview={waferPreview} onClose={() => setPreviewEventId(null)} />
    </div>
  );
}
