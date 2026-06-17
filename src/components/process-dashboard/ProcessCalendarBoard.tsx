"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Dayjs } from "dayjs";
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
  moveProcessCalendarEvent
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

type MoveWindow = {
  location: ProcessCalendarLocation;
  startsAt: string;
  endsAt: string;
};

type ActionMode = "step" | "manual";

type TimelineHeaderScale = {
  id: "minutes" | "hours" | "days";
  primaryUnit: "day" | "month";
  primaryLabelFormat: (timeRange: [Dayjs, Dayjs]) => string;
  secondaryUnit: "minute" | "hour" | "day";
  secondaryLabelFormat: (timeRange: [Dayjs, Dayjs]) => string;
};

type TimelineLocationGroup = TimelineGroupBase & {
  id: ProcessCalendarLocation;
  title: string;
  stackItems: true;
};

type CalendarTimelineItem = TimelineItemBase<number> & {
  id: string;
  group: ProcessCalendarLocation;
  title: string;
  event: ProcessCalendarEventView;
  peopleLabel: string;
  toneClass: string;
};

const LOCATIONS: ProcessCalendarLocation[] = ["McMaster", "Waterloo", "Toronto"];
const START_HOUR = 8;
const END_HOUR = 18;
const START_MINUTE = START_HOUR * 60;
const END_MINUTE = END_HOUR * 60;
const SNAP_MS = 15 * 60 * 1000;
const MIN_EVENT_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_MS = 60 * 60 * 1000;
const TRAVEL_BUFFER_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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

function eventLabel(event: ProcessCalendarEventView, stepsById: Map<string, string>) {
  if (event.process_step_id) {
    return stepsById.get(event.process_step_id) ?? "Process step";
  }

  return event.manual_action ?? "Manual action";
}

function eventTone(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("pol")) return "ww-timeline-item--green";
  if (normalized.includes("inspect")) return "ww-timeline-item--blue";
  if (normalized.includes("clean")) return "ww-timeline-item--soft";
  return "ww-timeline-item--pink";
}

function intervalsOverlap(startsAt: Date, endsAt: Date, otherStartsAt: Date, otherEndsAt: Date) {
  return startsAt < otherEndsAt && endsAt > otherStartsAt;
}

function sortCalendarEvents(events: ProcessCalendarEventView[]) {
  return [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
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

function createHeaderLabelFormatter(format: string) {
  return ([start]: [Dayjs, Dayjs]) => start.format(format);
}

const HEADER_SCALES: Record<TimelineHeaderScale["id"], TimelineHeaderScale> = {
  minutes: {
    id: "minutes",
    primaryUnit: "day",
    primaryLabelFormat: createHeaderLabelFormatter("ddd, MMM D"),
    secondaryUnit: "minute",
    secondaryLabelFormat: createHeaderLabelFormatter("h:mm A")
  },
  hours: {
    id: "hours",
    primaryUnit: "day",
    primaryLabelFormat: createHeaderLabelFormatter("ddd, MMM D"),
    secondaryUnit: "hour",
    secondaryLabelFormat: createHeaderLabelFormatter("h A")
  },
  days: {
    id: "days",
    primaryUnit: "month",
    primaryLabelFormat: createHeaderLabelFormatter("MMM YYYY"),
    secondaryUnit: "day",
    secondaryLabelFormat: createHeaderLabelFormatter("ddd D")
  }
};

function getHeaderScale(visibleSpan: number): TimelineHeaderScale {
  if (visibleSpan <= 4 * HOUR_MS) {
    return HEADER_SCALES.minutes;
  }

  if (visibleSpan <= 2 * DAY_MS) {
    return HEADER_SCALES.hours;
  }

  return HEADER_SCALES.days;
}

export function ProcessCalendarBoard({
  processTemplateId,
  calendarStartDate,
  days,
  steps,
  people,
  initialEvents
}: {
  processTemplateId: string;
  calendarStartDate: string;
  days: number;
  steps: ProcessStepOption[];
  people: ProcessCalendarPersonOption[];
  initialEvents: ProcessCalendarEventView[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEvents[0]?.id ?? null);
  const [actionMode, setActionMode] = useState<ActionMode>(steps.length ? "step" : "manual");
  const [selectedStepId, setSelectedStepId] = useState(steps[0]?.id ?? "");
  const [manualAction, setManualAction] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const undoStackRef = useRef<Array<{ eventId: string; previous: MoveWindow; next: MoveWindow }>>([]);
  const moveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestMoveRequestRef = useRef(0);

  const startDate = useMemo(() => new Date(`${calendarStartDate}T00:00:00`), [calendarStartDate]);
  const timelineStart = useMemo(() => buildDateAtMinute(startDate, START_MINUTE).getTime(), [startDate]);
  const timelineEnd = useMemo(
    () => buildDateAtMinute(addDays(startDate, Math.max(0, days - 1)), END_MINUTE).getTime(),
    [days, startDate]
  );
  const [visibleRange, setVisibleRange] = useState(() => ({
    boundsStart: timelineStart,
    boundsEnd: timelineEnd,
    start: timelineStart,
    end: timelineEnd
  }));
  const effectiveVisibleRange =
    visibleRange.boundsStart === timelineStart && visibleRange.boundsEnd === timelineEnd
      ? visibleRange
      : {
          boundsStart: timelineStart,
          boundsEnd: timelineEnd,
          start: timelineStart,
          end: timelineEnd
        };
  const headerScale = useMemo(
    () => getHeaderScale(effectiveVisibleRange.end - effectiveVisibleRange.start),
    [effectiveVisibleRange.end, effectiveVisibleRange.start]
  );

  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step.name])), [steps]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const selectedPeople = selectedPersonIds
    .map((personId) => peopleById.get(personId))
    .filter((person): person is ProcessCalendarPersonOption => Boolean(person));

  const groups = useMemo<TimelineLocationGroup[]>(
    () =>
      LOCATIONS.map((location) => ({
        id: location,
        title: location,
        rightTitle: `${events.filter((event) => event.location === location).length}`,
        stackItems: true
      })),
    [events]
  );

  const timelineItems = useMemo<CalendarTimelineItem[]>(
    () =>
      events.map((event) => {
        const label = eventLabel(event, stepsById);
        const peopleLabel = event.people.map((person) => person.display_name).join(", ");

        return {
          id: event.id,
          group: event.location as ProcessCalendarLocation,
          title: label,
          event,
          peopleLabel,
          toneClass: eventTone(label),
          start_time: new Date(event.starts_at).getTime(),
          end_time: new Date(event.ends_at).getTime(),
          canMove: true,
          canChangeGroup: true,
          canResize: "both",
          height: 30
        };
      }),
    [events, stepsById]
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

  const commitMove = useCallback((input: {
    eventId: string;
    previous: MoveWindow;
    next: MoveWindow;
    recordUndo: boolean;
  }) => {
    const eventToMove = events.find((event) => event.id === input.eventId);
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
  }, [events]);

  const handleItemMove = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["onItemMove"]>>(
    (itemId, dragTime, newGroupOrder) => {
      const eventId = String(itemId);
      const event = events.find((candidate) => candidate.id === eventId);
      const group = groups[newGroupOrder];
      if (!event || !group) {
        return;
      }

      const duration = Math.max(MIN_EVENT_MS, getEventDuration(event));
      const startsAt = new Date(dragTime);
      const endsAt = new Date(dragTime + duration);

      commitMove({
        eventId,
        previous: toMoveWindow(event),
        next: {
          location: group.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString()
        },
        recordUndo: true
      });
    },
    [commitMove, events, groups]
  );

  const handleItemResize = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["onItemResize"]>>(
    (itemId, resizeTime, edge) => {
      const eventId = String(itemId);
      const event = events.find((candidate) => candidate.id === eventId);
      if (!event || !edge) {
        return;
      }

      const currentStart = new Date(event.starts_at).getTime();
      const currentEnd = new Date(event.ends_at).getTime();
      const startsAt = edge === "left" ? resizeTime : currentStart;
      const endsAt = edge === "right" ? resizeTime : currentEnd;

      if (endsAt - startsAt < MIN_EVENT_MS) {
        return;
      }

      commitMove({
        eventId,
        previous: toMoveWindow(event),
        next: {
          location: event.location as ProcessCalendarLocation,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString()
        },
        recordUndo: true
      });
    },
    [commitMove, events]
  );

  const handleCanvasDoubleClick = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["onCanvasDoubleClick"]>>(
    (groupId, time) => {
      const location = LOCATIONS.find((candidate) => candidate === groupId);
      if (!location) {
        return;
      }

      const startsAt = new Date(time);
      const endsAt = new Date(time + DEFAULT_EVENT_MS);
      setDraft({ location, startsAt, endsAt });
      setSelectedEventId(null);
      setError(null);
      setActionMode(steps.length ? "step" : "manual");
      setSelectedStepId(steps[0]?.id ?? "");
      setManualAction("");
      setDescription("");
      setSelectedPersonIds([]);
      setPersonQuery("");
    },
    [steps]
  );

  const handleCanvasClick = useCallback(() => {
    setSelectedEventId(null);
  }, []);

  const handleItemSelect = useCallback((itemId: Id) => {
    setSelectedEventId(String(itemId));
    setDraft(null);
  }, []);

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
      const span = visibleTimeEnd - visibleTimeStart;
      const minStart = timelineStart;
      const maxEnd = timelineEnd;
      let nextStart = visibleTimeStart;
      let nextEnd = visibleTimeEnd;

      if (span >= maxEnd - minStart) {
        nextStart = minStart;
        nextEnd = maxEnd;
      } else if (nextStart < minStart) {
        nextStart = minStart;
        nextEnd = minStart + span;
      } else if (nextEnd > maxEnd) {
        nextEnd = maxEnd;
        nextStart = maxEnd - span;
      }

      setVisibleRange({
        boundsStart: timelineStart,
        boundsEnd: timelineEnd,
        start: nextStart,
        end: nextEnd
      });
      updateScrollCanvas(nextStart, nextEnd);
    },
    [timelineEnd, timelineStart]
  );

  const renderTimelineItem = useCallback<NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["itemRenderer"]>>(
    ({ item, itemContext, getItemProps, getResizeProps }) => {
      const resizeProps = getResizeProps();
      const { key, ...itemProps } = getItemProps({
        className: `ww-timeline-item ${item.toneClass} ${itemContext.selected ? "ww-timeline-item--selected" : ""}`
      });

      return (
        <div
          key={key}
          {...itemProps}
        >
          {itemContext.useResizeHandle ? <div {...resizeProps.left} className="ww-timeline-resize ww-timeline-resize--left" /> : null}
          <div className="ww-timeline-item-content">
            <strong>{item.title}</strong>
            <span>{item.peopleLabel || "Unassigned"}</span>
          </div>
          {itemContext.useResizeHandle ? <div {...resizeProps.right} className="ww-timeline-resize ww-timeline-resize--right" /> : null}
        </div>
      );
    },
    []
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
    });
  }

  function deleteSelectedEvent() {
    if (!selectedEvent) {
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

  return (
    <div className="calendar-scheduler calendar-scheduler--timeline">
      <div className="calendar-timeline-panel">
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
          itemVerticalGap={6}
          items={timelineItems}
          keys={TIMELINE_KEYS}
          lineHeight={46}
          maxZoom={days * 24 * 60 * 60 * 1000}
          minZoom={2 * 60 * 60 * 1000}
          moveResizeValidator={moveResizeValidator}
          onCanvasClick={handleCanvasClick}
          onCanvasDoubleClick={handleCanvasDoubleClick}
          onItemClick={handleItemSelect}
          onItemMove={handleItemMove}
          onItemResize={handleItemResize}
          onItemSelect={handleItemSelect}
          onTimeChange={handleTimeChange}
          selected={selectedEventId ? [selectedEventId] : []}
          sidebarWidth={132}
          stackItems
          timeSteps={{ second: 1, minute: 15, hour: 1, day: 1, month: 1, year: 1 }}
          useResizeHandle
          visibleTimeEnd={effectiveVisibleRange.end}
          visibleTimeStart={effectiveVisibleRange.start}
        >
          <TimelineHeaders className="ww-timeline-headers">
            <SidebarHeader>
              {({ getRootProps }) => <div {...getRootProps({ style: {} })}>Location</div>}
            </SidebarHeader>
            <DateHeader
              key={`primary-${headerScale.id}`}
              labelFormat={headerScale.primaryLabelFormat}
              unit={headerScale.primaryUnit}
            />
            <DateHeader
              key={`secondary-${headerScale.id}`}
              labelFormat={headerScale.secondaryLabelFormat}
              unit={headerScale.secondaryUnit}
            />
          </TimelineHeaders>
        </Timeline>
      </div>

      <aside className="calendar-inspector" aria-label="Calendar event details">
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
                  placeholder="Polling"
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

            <dl className="event-detail-list">
              <div>
                <dt>People</dt>
                <dd>{selectedEvent.people.map((person) => person.display_name).join(", ") || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{selectedEvent.description || "No description"}</dd>
              </div>
            </dl>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="calendar-inspector-actions">
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
