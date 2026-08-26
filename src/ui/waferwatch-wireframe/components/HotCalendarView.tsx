"use client";

import { useEffect, useMemo } from "react";
import type { ProcessCalendarLocation } from "@/features/calendar/queries";
import { useProcessWorkspace } from "@/features/workspace/store";
import type { Json } from "@/types/database";
import { CalendarView } from "./CalendarView";
import { useWorkspaceSession } from "@/features/workspace/WorkspaceSessionProvider";

const LOCATIONS = new Set<ProcessCalendarLocation>(["McMaster", "Waterloo", "Toronto"]);

function record(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function calendarLocation(value: Json | undefined): ProcessCalendarLocation {
  return typeof value === "string" && LOCATIONS.has(value as ProcessCalendarLocation)
    ? value as ProcessCalendarLocation
    : "McMaster";
}

function mapCalendarRows(
  rows: readonly Json[],
  waferById: Map<string, {
    id: string;
    wafer_code: string;
    die_label: string | null;
    current_step_name: string | null;
    current_handler_name: string | null;
  }>
) {
  return rows.flatMap((value) => {
    const row = record(value);
    if (
      typeof row?.id !== "string" ||
      typeof row.process_template_id !== "string" ||
      typeof row.starts_at !== "string" ||
      typeof row.ends_at !== "string" ||
      typeof row.revision !== "number"
    ) return [];
    const stepId = typeof row.process_step_id === "string" ? row.process_step_id : null;
    const waferId = typeof row.wafer_id === "string" ? row.wafer_id : null;
    const actionName = typeof row.action_name === "string"
      ? row.action_name
      : typeof row.process_step_name_snapshot === "string"
        ? row.process_step_name_snapshot
        : typeof row.manual_action === "string"
          ? row.manual_action
          : "Manual action";
    const people = Array.isArray(row.people) ? row.people.flatMap((candidate) => {
      const person = record(candidate);
      return typeof person?.id === "string" && typeof person.display_name === "string"
        ? [{ id: person.id, display_name: person.display_name }]
        : [];
    }) : [];
    const embeddedWafer = record(row.wafer ?? null);
    const wafer = embeddedWafer && typeof embeddedWafer.id === "string" && typeof embeddedWafer.wafer_code === "string"
      ? {
          id: embeddedWafer.id,
          wafer_code: embeddedWafer.wafer_code,
          die_label: typeof embeddedWafer.die_label === "string" ? embeddedWafer.die_label : null,
          current_step_name: typeof embeddedWafer.current_step_name === "string" ? embeddedWafer.current_step_name : null,
          current_handler_name: typeof embeddedWafer.current_handler_name === "string" ? embeddedWafer.current_handler_name : null
        }
      : waferId ? waferById.get(waferId) ?? null : null;
    return [{
      id: row.id,
      process_template_id: row.process_template_id,
      wafer_id: waferId,
      location: calendarLocation(row.location),
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      process_step_id: stepId,
      process_step_name_snapshot: stepId ? actionName : null,
      manual_action: stepId ? null : actionName,
      description: typeof row.description === "string" ? row.description : null,
      revision: row.revision,
      wafer,
      people
    }];
  });
}

export function HotCalendarView({ processId, canEdit }: { processId: string; canEdit: boolean }) {
  const workspaceSession = useWorkspaceSession();
  const effectiveProcessId = workspaceSession.activeProcessId ?? processId;
  const workspace = useProcessWorkspace(effectiveProcessId);
  const snapshot = workspace.optimisticSnapshot ?? workspace.snapshot;
  const bootstrap = workspace.hotBootstrap;

  const result = useMemo(() => {
    if (!snapshot || !bootstrap) {
      return { status: "unavailable" as const, message: "Loading the bounded process workspace…" };
    }
    const steps = snapshot.processDefinition.steps.flatMap((value) => {
      const row = record(value);
      return typeof row?.id === "string" && typeof row.name === "string"
        ? [{ id: row.id, name: row.name, order: typeof row.step_order === "number" ? row.step_order : 0 }]
        : [];
    }).sort((left, right) => left.order - right.order).map(({ id, name }) => ({ id, name }));
    const waferById = new Map<string, {
      id: string;
      wafer_code: string;
      die_label: string | null;
      current_step_name: string | null;
      current_handler_name: string | null;
    }>();
    for (const value of snapshot.currentState) {
      const row = record(value);
      if (typeof row?.wafer_id !== "string" || typeof row.wafer_code !== "string") continue;
      if (!waferById.has(row.wafer_id)) {
        waferById.set(row.wafer_id, {
          id: row.wafer_id,
          wafer_code: row.wafer_code,
          die_label: typeof row.die_label === "string" ? row.die_label : null,
          current_step_name: typeof row.current_step_name === "string" ? row.current_step_name : null,
          current_handler_name: typeof row.current_handler_name === "string" ? row.current_handler_name : null
        });
      }
    }
    const events = mapCalendarRows(snapshot.calendar, waferById);
    return {
      status: "ready" as const,
      data: {
        process: bootstrap.processSummary,
        steps,
        wafers: Array.from(waferById.values()),
        people: [],
        initialEvents: events,
        cachedWeeks: workspace.calendarWeeks.map((week) => ({
          startDate: week.from.slice(0, 10),
          events: mapCalendarRows(week.rows, waferById)
        })),
        initialStartDate: bootstrap.calendarRange.from.slice(0, 10),
        canEdit,
        workspaceBacked: true,
        workspaceRevision: snapshot.revision
      }
    };
  }, [bootstrap, canEdit, snapshot, workspace.calendarWeeks]);

  useEffect(() => {
    if (!snapshot || document.body.dataset.perfTestMode !== "1") return;
    requestAnimationFrame(() => performance.mark("waferwatch:route-dom-ready"));
  }, [snapshot]);

  return <CalendarView key={effectiveProcessId} result={result} />;
}
