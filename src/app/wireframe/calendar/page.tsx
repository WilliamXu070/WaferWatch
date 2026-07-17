import { CalendarView } from "@/ui/waferwatch-wireframe";
import { getProcessCalendarSchedule, type ProcessCalendarLocation } from "@/features/calendar/queries";
import {
  getFirstActiveProcessTemplateId,
  getProcessDashboardData,
  getProcessTemplate
} from "@/features/process-flows/queries";
import { orderProcessStepsByOccurrence } from "@/features/process-flows/step-order";
import { canEditProject, canManageProcessLibrary, getCurrentAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Calendar · WaferWatch wireframe"
};

export const dynamic = "force-dynamic";

type SearchParams = {
  processId?: string | string[];
};

const LOCATIONS: readonly ProcessCalendarLocation[] = ["McMaster", "Waterloo", "Toronto"];

type CalendarLoadResult =
  | {
      status: "ready";
      data: {
        process: {
          id: string;
          name: string;
          version: string;
        };
        steps: { id: string; name: string }[];
        wafers: {
          id: string;
          wafer_code: string;
          die_label?: string | null;
          current_step_name?: string | null;
          current_handler_name?: string | null;
        }[];
        people: { id: string; display_name: string }[];
        initialEvents: Array<{
          id: string;
          process_template_id: string;
          location: ProcessCalendarLocation;
          starts_at: string;
          ends_at: string;
          process_step_id: string | null;
          process_step_name_snapshot: string | null;
          manual_action: string | null;
          description: string | null;
          revision: number;
          wafer_id: string | null;
          wafer: { id: string; wafer_code: string } | null;
          people: { id: string; display_name: string }[];
        }>;
        initialStartDate: string;
        canEdit: boolean;
      };
    }
  | { status: "unauthenticated" }
  | { status: "no-process" }
  | { status: "unavailable"; message: string };

function getRequestedProcessId(searchParams: SearchParams) {
  const raw = searchParams.processId;
  return Array.isArray(raw) ? raw[0] : raw;
}

function toCalendarLocation(value: string): ProcessCalendarLocation {
  return LOCATIONS.find((location) => location === value) ?? "McMaster";
}

function getMondayWeekStart(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  next.setHours(0, 0, 0, 0);
  return next;
}

async function loadBackendCalendar(requestedProcessId?: string): Promise<CalendarLoadResult> {
  const supabase = await createServerSupabaseClient();
  const account = await getCurrentAccount();

  if (!account) {
    return { status: "unauthenticated" };
  }

  const processId = requestedProcessId ?? await getFirstActiveProcessTemplateId();
  if (!processId) {
    return { status: "no-process" };
  }

  const process = await getProcessTemplate(processId);
  const queryStart = new Date(2000, 0, 1);
  const queryEnd = new Date(2099, 11, 31, 23, 59, 59, 999);
  const [canEdit, schedule, wafersResult, dashboardData] = await Promise.all([
    process.owner_project_id
      ? canEditProject(process.owner_project_id, account)
      : Promise.resolve(canManageProcessLibrary(account.profile.role)),
    getProcessCalendarSchedule(
      process.id,
      queryStart.toISOString(),
      queryEnd.toISOString()
    ),
    supabase
      .from("wafer_process_assignments")
      .select("wafers(id, wafer_code)")
      .eq("template_id", process.id)
      .in("status", ["planned", "queued", "in_progress", "on_hold"])
      .order("assigned_at", { ascending: false }),
    getProcessDashboardData(process.id, 0, false, process)
  ]);

  if (wafersResult.error) {
    throw wafersResult.error;
  }

  const wafers = (wafersResult.data ?? [])
    .map((row) => Array.isArray(row.wafers) ? row.wafers[0] : row.wafers)
    .filter((wafer): wafer is { id: string; wafer_code: string } => Boolean(wafer?.id));
  const activeStateByWaferId = new Map(
    dashboardData.activeWaferStates.map((state) => [state.waferId, state])
  );
  const previewWafers = wafers.map((wafer) => {
    const state = activeStateByWaferId.get(wafer.id);
    return {
      ...wafer,
      die_label: state?.dieLabel ?? null,
      current_step_name: state?.currentStepName ?? null,
      current_handler_name: state?.currentHandlerName ?? null
    };
  });

  return {
    status: "ready",
    data: {
      process: {
        id: process.id,
        name: process.name,
        version: process.version
      },
      steps: orderProcessStepsByOccurrence(process.process_steps, process.process_step_transitions)
        .map((step) => ({ id: step.id, name: step.name })),
      wafers: previewWafers,
      people: schedule.people,
      initialEvents: schedule.events.map((event) => ({
        ...event,
        wafer_id: event.wafer_id ?? null,
        wafer: event.wafer ?? null,
        location: toCalendarLocation(event.location)
      })),
      initialStartDate: getMondayWeekStart(new Date()).toISOString().slice(0, 10),
      canEdit
    }
  };
}

export default async function WireframeCalendarPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const requestedProcessId = getRequestedProcessId(await searchParams);
  const calendarResult = await loadBackendCalendar(requestedProcessId).catch((error: unknown) => ({
    status: "unavailable" as const,
    message: error instanceof Error ? error.message : "Calendar backend could not be loaded."
  }));

  return <CalendarView result={calendarResult} />;
}
