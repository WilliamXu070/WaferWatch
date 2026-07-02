import { CalendarView } from "@/ui/waferwatch-wireframe";
import { getProcessCalendarSchedule, type ProcessCalendarLocation } from "@/features/calendar/queries";
import { getProcessTemplate, listProcessTemplates } from "@/features/process-flows/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Calendar · WaferWatch wireframe"
};

export const dynamic = "force-dynamic";

type SearchParams = {
  processId?: string | string[];
};

const LOCATIONS: readonly ProcessCalendarLocation[] = ["McMaster", "Waterloo", "Toronto"];

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

async function loadBackendCalendar(requestedProcessId?: string) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    return null;
  }

  const templates = await listProcessTemplates();
  const fallbackTemplate = templates.find((template) => template.is_active) ?? templates[0];

  if (!fallbackTemplate) {
    return null;
  }

  const process = requestedProcessId
    ? await getProcessTemplate(requestedProcessId).catch(() => fallbackTemplate)
    : fallbackTemplate;

  const queryStart = new Date(2000, 0, 1);
  const queryEnd = new Date(2099, 11, 31, 23, 59, 59, 999);
  const schedule = await getProcessCalendarSchedule(
    process.id,
    queryStart.toISOString(),
    queryEnd.toISOString()
  );

  return {
    process: {
      id: process.id,
      name: process.name,
      version: process.version
    },
    steps: process.process_steps
      .slice()
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({ id: step.id, name: step.name })),
    people: schedule.people,
    initialEvents: schedule.events.map((event) => ({
      ...event,
      location: toCalendarLocation(event.location)
    })),
    initialStartDate: getMondayWeekStart(new Date()).toISOString().slice(0, 10)
  };
}

export default async function WireframeCalendarPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const requestedProcessId = getRequestedProcessId(await searchParams);
  const calendarData = await loadBackendCalendar(requestedProcessId).catch(() => null);

  return <CalendarView backendEnabled={Boolean(calendarData)} {...(calendarData ?? {})} />;
}
