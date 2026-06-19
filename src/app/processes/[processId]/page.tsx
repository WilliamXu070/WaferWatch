import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProcessDashboardData } from "@/features/process-flows/queries";
import { getProcessCalendarSchedule } from "@/features/calendar/queries";
import { signOut } from "@/features/accounts/actions";
import { ProcessDashboardTabsClient } from "@/components/process-dashboard/ProcessDashboardTabsClient";

export const dynamic = "force-dynamic";

type DashboardView = "flow" | "calendar" | "wafers";

function getActiveView(raw: string | string[] | undefined): DashboardView {
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  if (candidate === "calendar" || candidate === "wafers" || candidate === "flow") {
    return candidate;
  }

  return "flow";
}

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

  const calendarStart = getMondayWeekStart(new Date());
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarStart.getDate() + 6);
  calendarEnd.setHours(23, 59, 59, 999);

  const shouldLoadCalendar = activeView === "calendar";
  const dashboardData = await getProcessDashboardData(
    processId,
    shouldLoadCalendar ? 7 : 14,
    shouldLoadCalendar
  ).catch(() => null);

  if (!dashboardData) {
    redirect("/processes");
  }

  const { process, activeWaferStates, workspaceWaferStates } = dashboardData;
  const sortedSteps = [...process.process_steps].sort((a, b) => a.step_order - b.step_order);
  const flowColumns = sortedSteps.map((step) => ({
    id: step.id,
    name: step.name,
    process_area: step.process_area,
    step_order: step.step_order,
    wafers: activeWaferStates
      .filter((state) => state.currentStepId === step.id)
      .map((state) => ({
        assignmentId: state.assignmentId,
        waferCode: state.waferCode,
        dieLabel: state.dieLabel,
        currentStepStatus: state.currentStepStatus
      }))
  }));

  const calendarSchedule = shouldLoadCalendar
    ? await getProcessCalendarSchedule(
        process.id,
        calendarStart.toISOString(),
        calendarEnd.toISOString()
      )
    : null;

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

      <ProcessDashboardTabsClient
        process={process}
        flowColumns={flowColumns}
        activeWaferStates={activeWaferStates}
        workspaceWaferStates={workspaceWaferStates}
        calendarRange={{
          startDate: calendarStart.toISOString(),
          endDate: calendarEnd.toISOString()
        }}
        initialView={activeView}
        calendarPeople={calendarSchedule?.people ?? []}
        calendarEvents={calendarSchedule?.events ?? []}
      />
    </main>
  );
}
