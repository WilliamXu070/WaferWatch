"use client";

import { useCallback, useState } from "react";
import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import { CurrentWaferStatusWorkspace } from "@/components/process-dashboard/CurrentWaferStatusWorkspace";
import { LazyProcessCalendarBoard } from "@/components/process-dashboard/LazyProcessCalendarBoard";
import type {
  ProcessCalendarEventView,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";
import type { ProcessTemplateWithSteps } from "@/features/process-flows/queries";
import { orderProcessStepsByOccurrence } from "@/features/process-flows/step-order";
import type { StepStatus } from "@/types/database";

type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  wafers: {
    assignmentId: string;
    waferCode: string;
    dieLabel: string | null;
    currentStepStatus: StepStatus | null;
  }[];
};

type CalendarRange = {
  startDate: string;
  endDate: string;
};

type DashboardView = "flow" | "calendar" | "wafers";

type Props = {
  process: ProcessTemplateWithSteps;
  flowColumns: DiagramStep[];
  activeWaferStates: Parameters<typeof CurrentWaferStatusWorkspace>["0"]["states"];
  workspaceWaferStates: Parameters<typeof CurrentWaferStatusWorkspace>["0"]["states"];
  calendarRange: CalendarRange;
  initialView: DashboardView;
  calendarPeople: ProcessCalendarPersonOption[];
  calendarEvents: ProcessCalendarEventView[];
};

const dashboardTabs: Array<{ key: DashboardView; label: string }> = [
  { key: "flow", label: "Process flow" },
  { key: "calendar", label: "Calendar" },
  { key: "wafers", label: "Current wafers / die status" }
];

function getWeekdayCount(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const msPerDay = 24 * 60 * 60 * 1000;

  const delta = endDate.getTime() - startDate.getTime();
  if (Number.isNaN(delta)) {
    return 1;
  }

  return Math.max(1, Math.floor(delta / msPerDay) + 1);
}

export function ProcessDashboardTabsClient({
  process,
  flowColumns,
  activeWaferStates,
  workspaceWaferStates,
  calendarRange,
  initialView,
  calendarPeople,
  calendarEvents
}: Props) {
  const [activeTab, setActiveTab] = useState<DashboardView>(initialView);
  const [isCalendarLoaded, setIsCalendarLoaded] = useState(initialView === "calendar");
  const [calendarDataPeople, setCalendarDataPeople] = useState(calendarPeople);
  const [calendarDataEvents, setCalendarDataEvents] = useState(calendarEvents);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  const loadCalendar = useCallback(async () => {
    if (isCalendarLoaded || isLoadingCalendar) {
      return;
    }

    setIsLoadingCalendar(true);

    try {
      const response = await fetch(
        `/api/processes/${process.id}/calendar?from=${encodeURIComponent(
          calendarRange.startDate
        )}&to=${encodeURIComponent(calendarRange.endDate)}`,
        { credentials: "same-origin" }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load calendar data.");
      }

      setCalendarDataPeople(payload.people ?? []);
      setCalendarDataEvents(payload.events ?? []);
      setIsCalendarLoaded(true);
    } catch {
      setCalendarDataPeople([]);
      setCalendarDataEvents([]);
      setIsCalendarLoaded(true);
    } finally {
      setIsLoadingCalendar(false);
    }
  }, [calendarRange.endDate, calendarRange.startDate, isCalendarLoaded, isLoadingCalendar, process.id]);

  const handleSelectTab = async (tab: DashboardView) => {
    if (tab === "calendar") {
      if (!isCalendarLoaded) {
        await loadCalendar();
      }
    }

    setActiveTab(tab);

    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      search.set("view", tab);
      window.history.replaceState({}, "", `${window.location.pathname}?${search.toString()}`);
    }
  };

  return (
    <>
      <nav className="dashboard-tab-bar" aria-label="Process dashboard view">
        {dashboardTabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <button
              type="button"
              key={tab.key}
              className={isActive ? "dashboard-tab active" : "dashboard-tab"}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                void handleSelectTab(tab.key);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section className="panel dashboard-panel">
        {activeTab === "flow" ? (
          <ProcessFlowDiagram
            steps={flowColumns.map((step) => ({
              ...step,
              wafers: step.wafers
            }))}
          />
        ) : null}

        {activeTab === "wafers" ? (
          <CurrentWaferStatusWorkspace
            states={workspaceWaferStates.length ? workspaceWaferStates : activeWaferStates}
          />
        ) : null}

        {activeTab === "calendar" ? (
          <>
            <div className="section-heading">
              <h2>Calendar</h2>
              <p className="muted">Process work across McMaster, Waterloo, and Toronto.</p>
            </div>

            {isLoadingCalendar ? <p className="muted">Loading calendar...</p> : null}

            <LazyProcessCalendarBoard
              processTemplateId={process.id}
              calendarStartDate={new Date(calendarRange.startDate).toISOString().slice(0, 10)}
              days={getWeekdayCount(calendarRange.startDate, calendarRange.endDate)}
              steps={orderProcessStepsByOccurrence(process.process_steps, process.process_step_transitions)
                .map((step) => ({ id: step.id, name: step.name }))}
              people={calendarDataPeople}
              initialEvents={calendarDataEvents}
            />
          </>
        ) : null}
      </section>
    </>
  );
}
