"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import type { CalendarEventModel, CalendarSiteModel } from "../types";
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, TowerIcon, UserIcon } from "../icons";
import { calendarModel, calendarWindow, flowModel } from "../mock-data";
import { UpcomingHandoffs } from "./UpcomingHandoffs";

const rangeModes = ["Day", "Week", "Month"] as const;
type RangeMode = (typeof rangeModes)[number];

const WIRE_TIME_ZONE = "America/Toronto";
const MIN_SHORT_EVENT_SPAN_DAYS = 0.98;

type WeekDay = {
  key: string;
  label: string;
  sublabel: string;
  isWeekend: boolean;
};

type EventTone = "amber" | "blue" | "green";

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

function getWeekOffset(date: Date, weekDays: WeekDay[]) {
  const dayIndex = weekDays.findIndex((day) => day.key === formatDateKey(date));
  if (dayIndex === -1) {
    return date.getTime() < new Date(`${weekDays[0]?.key ?? ""}T00:00:00`).getTime()
      ? 0
      : weekDays.length;
  }

  return dayIndex + getZonedMinuteOfDay(date) / 1440;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getEventStyle(event: CalendarEventModel, weekDays: WeekDay[]): CSSProperties {
  const startOffset = clamp(getWeekOffset(new Date(event.starts_at), weekDays), 0, weekDays.length);
  const endOffset = clamp(getWeekOffset(new Date(event.ends_at), weekDays), 0, weekDays.length);
  const naturalSpan = Math.max(0.18, endOffset - startOffset);
  const minimumSpan = event.id === "evt-litho" ? naturalSpan : Math.max(naturalSpan, MIN_SHORT_EVENT_SPAN_DAYS);
  const safeEndOffset = clamp(startOffset + minimumSpan, startOffset + 0.18, weekDays.length);

  return {
    left: `${(startOffset / weekDays.length) * 100}%`,
    top: event.id === "evt-litho" ? "28px" : "24px",
    width: `${((safeEndOffset - startOffset) / weekDays.length) * 100}%`
  };
}

function formatTimeRange(event: CalendarEventModel) {
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: WIRE_TIME_ZONE
  });

  if (formatDateKey(startsAt) === formatDateKey(endsAt)) {
    return `${timeFormatter.format(startsAt)} - ${timeFormatter.format(endsAt)}`;
  }

  const startDate = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: WIRE_TIME_ZONE
  }).format(startsAt);
  const endDate = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: WIRE_TIME_ZONE
  }).format(endsAt);

  return `${startDate} ${timeFormatter.format(startsAt)} - ${endDate} ${timeFormatter.format(endsAt)}`;
}

function toDisplayName(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function eventTone(event: CalendarEventModel): EventTone {
  if (event.id === "evt-litho") return "blue";
  if (event.id === "evt-clean") return "green";
  return "amber";
}

function eventTitle(event: CalendarEventModel) {
  if (event.id === "evt-intake") return "New event";
  if (event.manual_action) return event.manual_action;

  return flowModel.steps.find((step) => step.id === event.process_step_id)?.name ?? "Process event";
}

function SiteIcon({ site }: { site: CalendarSiteModel }) {
  if (site.id === "Toronto") {
    return <TowerIcon />;
  }

  return <BuildingIcon />;
}

function CalendarEventCard({ event, weekDays }: { event: CalendarEventModel; weekDays: WeekDay[] }) {
  const peopleLabel = event.people.map((person) => toDisplayName(person.display_name)).join(", ");
  const isDraft = event.id === "evt-intake";

  return (
    <article
      className={`wireframe-calendar-event wireframe-calendar-event--${eventTone(event)}`}
      style={getEventStyle(event, weekDays)}
    >
      <div className="wireframe-calendar-event__header">
        <h3>{eventTitle(event)}</h3>
        {isDraft ? <span>Draft</span> : null}
      </div>

      {peopleLabel && !isDraft ? (
        <p className="wireframe-calendar-event__person">
          <UserIcon />
          {peopleLabel}
        </p>
      ) : null}

      <p className="wireframe-calendar-event__time">{formatTimeRange(event)}</p>

      {isDraft && event.description ? (
        <p className="wireframe-calendar-event__description">{event.description}</p>
      ) : null}
    </article>
  );
}

function WireframeCalendarGrid() {
  const weekDays = buildWeekDays(calendarWindow.startDate, calendarWindow.days);

  return (
    <div className="wireframe-calendar-week" aria-label="Weekly process calendar">
      <div className="wireframe-calendar-week__inner">
        <div className="wireframe-calendar-week__header">
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
            <div className="wireframe-calendar-week__track">
              <div className="wireframe-calendar-week__day-grid" aria-hidden="true">
                {weekDays.map((day) => (
                  <span
                    key={day.key}
                    className={day.isWeekend ? "wireframe-calendar-week__day--weekend" : undefined}
                  />
                ))}
              </div>
              {calendarModel.events
                .filter((event) => event.location === site.id)
                .map((event) => (
                  <CalendarEventCard key={event.id} event={event} weekDays={weekDays} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarView() {
  const [mode, setMode] = useState<RangeMode>("Week");

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="wireframe-calendar-card rounded-2xl border border-ww-border bg-white">
        <header className="wireframe-calendar-card__header flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ww-ink">{calendarModel.title}</h1>
            <p className="mt-1 text-sm text-[#8a887f]">{calendarModel.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-ww-border bg-[#fafaf7] p-1">
              {rangeModes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
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
              >
                <ChevronLeftIcon />
              </button>
              <span className="px-2 text-sm font-medium text-ww-ink">{calendarModel.rangeLabel}</span>
              <button
                type="button"
                aria-label="Next range"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#5f5d57] hover:bg-[#f4f4ef]"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <button
              type="button"
              className="rounded-xl border border-ww-border bg-white px-4 py-2 text-sm font-medium text-[#48453f] transition-colors hover:bg-[#f4f4ef]"
            >
              Today
            </button>
          </div>
        </header>

        <WireframeCalendarGrid />
      </section>

      <UpcomingHandoffs handoffs={calendarModel.handoffs} />
    </div>
  );
}
