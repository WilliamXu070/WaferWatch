import type { Dayjs } from "dayjs";
import type { TimelineGroupBase, TimelineItemBase } from "react-calendar-timeline";
import type {
  ProcessCalendarEventView,
  ProcessCalendarLocation,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";

export type ProcessStepOption = {
  id: string;
  name: string;
};

export type DraftEvent = {
  location: ProcessCalendarLocation;
  startsAt: Date;
  endsAt: Date;
};

export type DraftDragSelection = {
  pointerId: number;
  location: ProcessCalendarLocation;
  anchorTime: number;
  currentTime: number;
};

export type TimelinePanState = {
  pointerId: number;
  startX: number;
  startStart: number;
  startEnd: number;
  moved: boolean;
};

export type PendingTimelineMove = {
  eventId: string;
  previous: MoveWindow;
  next: MoveWindow;
};

export type MoveWindow = {
  location: ProcessCalendarLocation;
  startsAt: string;
  endsAt: string;
};

export type ActionMode = "step" | "manual";
export type StageFilterId = string | "__manual__";
export type CalendarPresentationMode = "default" | "wireframe";
export type CalendarPersistenceMode = "server" | "local";

export type TimelineHeaderScale = {
  id: "minutes" | "hours" | "blocks" | "days";
  primaryUnit: "day" | "month";
  primaryLabelFormat: (timeRange: [Dayjs, Dayjs]) => string;
  secondaryUnit: "minute" | "hour" | "day";
  secondaryLabelFormat: (timeRange: [Dayjs, Dayjs]) => string;
  hourStep: 1 | 6;
};

export type WireframeHeaderScale = {
  id: "days" | "weeks" | "months";
  unit: "day" | "month";
  labelFormat: (timeRange: [Dayjs, Dayjs]) => string;
};

export type TimelineLocationGroup = TimelineGroupBase & {
  id: ProcessCalendarLocation;
  title: string;
  stackItems: true;
};

export type CalendarTimelineRef = {
  getBoundingClientRect(): DOMRect;
};

export type CalendarTimelineItem = TimelineItemBase<number> & {
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

export type ProcessCalendarBoardProps = {
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
