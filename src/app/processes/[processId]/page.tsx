import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProcessDashboardData } from "@/features/process-flows/queries";
import { getProcessCalendarSchedule } from "@/features/calendar/queries";
import type { StepStatus } from "@/types/database";
import { signOut } from "@/features/accounts/actions";
import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import { ProcessCalendarBoard } from "@/components/process-dashboard/ProcessCalendarBoard";

export const dynamic = "force-dynamic";

type DashboardView = "flow" | "calendar" | "wafers";

function getAssignmentStatusLabel(status: StepStatus | null) {
  if (!status) {
    return "pending";
  }

  if (status === "running") {
    return "running";
  }

  if (status === "queued") {
    return "queued";
  }

  if (status === "blocked" || status === "failed") {
    return status;
  }

  return "done";
}

function statusClass(status: StepStatus | null) {
  const value = getAssignmentStatusLabel(status);
  if (value === "running") {
    return "status-pill status-pill--active";
  }
  return "status-pill status-pill--inactive";
}

function labelWafer(waferCode: string, dieLabel: string | null) {
  return dieLabel ? `${waferCode} • ${dieLabel}` : waferCode;
}

function getActiveView(raw: string | string[] | undefined): DashboardView {
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  if (candidate === "calendar" || candidate === "wafers" || candidate === "flow") {
    return candidate;
  }

  return "flow";
}

const dashboardTabs: Array<{ key: DashboardView; label: string }> = [
  { key: "flow", label: "Process flow" },
  { key: "calendar", label: "Calendar" },
  { key: "wafers", label: "Current wafers / chip status" }
];

const CALENDAR_WEEK_DAYS = 7;

function getMondayWeekStart(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const offset = day === 0 ? -6 : 1 - day;

  weekStart.setDate(weekStart.getDate() + offset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export default async function ProcessDashboardPage({
  params,
  searchParams
}: {
  params: Promise<{ processId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const processId = (await params).processId;
  const activeView = getActiveView((await searchParams).view);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/");
  }

  const dashboardData = await getProcessDashboardData(processId).catch(() => null);
  if (!dashboardData) {
    redirect("/processes");
  }

  const { process, activeWaferStates } = dashboardData;
  const sortedSteps = [...process.process_steps].sort((a, b) => a.step_order - b.step_order);
  const flowColumns = sortedSteps.map((step) => ({
    ...step,
    wafers: activeWaferStates.filter((state) => state.currentStepId === step.id)
  }));

  const calendarStart = getMondayWeekStart(new Date());
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarStart.getDate() + CALENDAR_WEEK_DAYS - 1);
  calendarEnd.setHours(23, 59, 59, 999);
  const calendarSchedule = await getProcessCalendarSchedule(
    process.id,
    calendarStart.toISOString(),
    calendarEnd.toISOString()
  );

  return (
    <main className="page-shell">
      <section className="page-heading" style={{ width: "100%", alignItems: "center" }}>
        <div>
          <p className="eyebrow">WaferWatch</p>
          <h1>Processes</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/processes" className="button button-secondary">
            Back to processes
          </Link>
          <form action={signOut}>
            <button className="button button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>

      <section className="process-stats" aria-live="polite">
        <p className="muted">
          <strong>{process.name}</strong> · {process.version}
          <span style={{ marginLeft: "8px", opacity: 0.7 }}>
            · {activeWaferStates.length} die{activeWaferStates.length === 1 ? "" : "s"} in rotation.
          </span>
        </p>
      </section>

      <nav className="dashboard-tab-bar" aria-label="Process dashboard view">
        {dashboardTabs.map((tab) => {
          const isActive = activeView === tab.key;

          return (
            <Link
              prefetch={false}
              href={`/processes/${process.id}?view=${tab.key}`}
              key={tab.key}
              className={isActive ? "dashboard-tab active" : "dashboard-tab"}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <section className="panel dashboard-panel">
        {activeView === "flow" ? (
          <>
            <ProcessFlowDiagram
              steps={flowColumns.map((step) => ({
                id: step.id,
                name: step.name,
                process_area: step.process_area,
                step_order: step.step_order,
                wafers: step.wafers
              }))}
            />
          </>
        ) : null}

        {activeView === "wafers" ? (
          <>
            <div className="section-heading">
              <h2>Current wafers / chip status</h2>
              <p className="muted">Live rotation at this process level</p>
            </div>
            <div className="step-list">
              {activeWaferStates.length === 0 ? (
                <p className="muted">No wafers are currently in this process.</p>
              ) : (
                activeWaferStates.map((state) => (
                  <article className="step-row" key={state.assignmentId}>
                    <span className="step-index">W</span>
                    <div>
                      <strong>{labelWafer(state.waferCode, state.dieLabel)}</strong>
                      <p className="muted">Current step: {state.currentStepName ?? "Waiting to start"}</p>
                      <p className="muted">Area: {state.currentStepArea ?? "TBD"}</p>
                      <p className="muted">Status: {state.assignmentStatus}</p>
                    </div>
                    <span className={statusClass(state.currentStepStatus)}>
                      {getAssignmentStatusLabel(state.currentStepStatus)}
                    </span>
                  </article>
                ))
              )}
            </div>
          </>
        ) : null}

        {activeView === "calendar" ? (
          <>
            <div className="section-heading">
              <h2>Calendar</h2>
              <p className="muted">Process work across McMaster, Waterloo, and Toronto.</p>
            </div>

            <ProcessCalendarBoard
              processTemplateId={process.id}
              calendarStartDate={calendarStart.toISOString().slice(0, 10)}
              days={CALENDAR_WEEK_DAYS}
              steps={sortedSteps.map((step) => ({ id: step.id, name: step.name }))}
              people={calendarSchedule.people}
              initialEvents={calendarSchedule.events}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
