import type { ActionResult } from "@/lib/action-result";
import type { ActiveProcessDestination } from "@/features/process-selection/selection";
import type { ProcessHotBootstrap } from "@/features/workspace/types";

export type UpdateProcessNameAction = (input: {
  templateId: string;
  name: string;
}) => Promise<ActionResult<{ id: string; name: string; version: string }>>;

export type CreateProcessAction = (input: {
  name: string;
  version?: string;
  description?: string | null;
  ownerProjectId?: string | null;
  isActive?: boolean;
}) => Promise<ActionResult<{ id: string; name: string; version: string }>>;

export type DeleteProcessAction = (input: {
  templateId: string;
}) => Promise<ActionResult<{ deleted: string }>>;

export type SelectProcessAction = (input: {
  processId: string;
  destination: ActiveProcessDestination;
}) => Promise<{
  process: ProcessHotBootstrap["processSummary"];
  destination: ActiveProcessDestination;
}>;
