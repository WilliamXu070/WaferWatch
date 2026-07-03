import type { ProcessCalendarEventView, ProcessCalendarLocation } from "@/features/calendar/queries";
import {
  LOCATION_TONE_CLASSES,
  MIN_EVENT_MS
} from "./constants";
import type {
  CalendarPresentationMode,
  DraftDragSelection,
  DraftEvent,
  MoveWindow
} from "./types";

export function toDisplayName(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function eventLabel(event: ProcessCalendarEventView, stepsById: Map<string, string>) {
  if (event.process_step_id) {
    return stepsById.get(event.process_step_id) ?? "Process step";
  }

  return event.manual_action ?? "Manual action";
}

export function eventTone(label: string, presentationMode: CalendarPresentationMode) {
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

export function locationTone(location: ProcessCalendarLocation) {
  return LOCATION_TONE_CLASSES[location] ?? "ww-timeline-item--amber";
}

export function getWireframeEventTitle(
  event: ProcessCalendarEventView,
  label: string,
  presentationMode: CalendarPresentationMode
) {
  if (presentationMode === "wireframe" && event.id === "evt-intake") {
    return "New event";
  }

  return label;
}

export function getWireframeEventBadge(event: ProcessCalendarEventView, presentationMode: CalendarPresentationMode) {
  return presentationMode === "wireframe" && event.id === "evt-intake" ? "Draft" : undefined;
}

export function intervalsOverlap(startsAt: Date, endsAt: Date, otherStartsAt: Date, otherEndsAt: Date) {
  return startsAt < otherEndsAt && endsAt > otherStartsAt;
}

export function sortCalendarEvents(events: ProcessCalendarEventView[]) {
  return [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function toggleSelection(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function toMoveWindow(event: ProcessCalendarEventView): MoveWindow {
  return {
    location: event.location as ProcessCalendarLocation,
    startsAt: event.starts_at,
    endsAt: event.ends_at
  };
}

export function applyMoveWindow(event: ProcessCalendarEventView, window: MoveWindow): ProcessCalendarEventView {
  return {
    ...event,
    location: window.location,
    starts_at: window.startsAt,
    ends_at: window.endsAt
  };
}

export function getEventDuration(event: ProcessCalendarEventView) {
  return new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();
}

export function draftFromSelection(selection: DraftDragSelection, minTime: number, maxTime: number): DraftEvent {
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

export function isBlankTimelineTarget(target: EventTarget | null) {
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

export function buildWireframePeopleSummary(persons: string[]) {
  if (persons.length === 0) {
    return "No one";
  }

  if (persons.length === 1) {
    return persons[0];
  }

  const [first, second] = persons;
  if (persons.length === 2) {
    return `${first}, ${second}`;
  }

  return `${first}, ${second} +${persons.length - 2}`;
}

export function areMoveWindowsEqual(left: MoveWindow, right: MoveWindow) {
  return left.location === right.location && left.startsAt === right.startsAt && left.endsAt === right.endsAt;
}
