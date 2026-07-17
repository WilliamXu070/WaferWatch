import type { ProcessCalendarLocation } from "@/features/calendar/queries";

export const LOCATIONS: ProcessCalendarLocation[] = ["McMaster", "Waterloo", "Toronto"];
export const LOCATION_REGIONS: Record<ProcessCalendarLocation, string> = {
  McMaster: "Hamilton",
  Waterloo: "Waterloo",
  Toronto: "Toronto"
};
export const LOCATION_TONE_CLASSES: Record<ProcessCalendarLocation, string> = {
  McMaster: "ww-timeline-item--amber",
  Waterloo: "ww-timeline-item--blue",
  Toronto: "ww-timeline-item--green"
};

export const START_HOUR = 8;
export const END_HOUR = 18;
export const START_MINUTE = START_HOUR * 60;
export const END_MINUTE = END_HOUR * 60;
export const SNAP_MS = 15 * 60 * 1000;
export const MIN_EVENT_MS = 30 * 60 * 1000;
export const DEFAULT_EVENT_MS = 60 * 60 * 1000;
export const MIN_ZOOM_MS = 2 * 60 * 60 * 1000;
export const TRAVEL_BUFFER_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_CALENDAR_ZOOM_MS = 183 * DAY_MS;
export const DEFAULT_VISIBLE_RANGE_DAYS = 7;
export const HOUR_MS = 60 * 60 * 1000;
export const MANUAL_STAGE_FILTER_ID = "__manual__";

export const TIMELINE_KEYS = {
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
