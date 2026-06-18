"use client";

import dynamic from "next/dynamic";
import type { ProcessCalendarEventView, ProcessCalendarPersonOption } from "@/features/calendar/queries";

type ProcessStepOption = {
  id: string;
  name: string;
};

type LazyProcessCalendarBoardProps = {
  processTemplateId: string;
  calendarStartDate: string;
  days: number;
  steps: ProcessStepOption[];
  people: ProcessCalendarPersonOption[];
  initialEvents: ProcessCalendarEventView[];
};

const DynamicProcessCalendarBoard = dynamic(
  () => import("@/components/process-dashboard/ProcessCalendarBoard").then((mod) => mod.ProcessCalendarBoard),
  {
    ssr: false,
    loading: () => <p className="muted">Loading calendar...</p>
  }
);

export function LazyProcessCalendarBoard(props: LazyProcessCalendarBoardProps) {
  return <DynamicProcessCalendarBoard {...props} />;
}
