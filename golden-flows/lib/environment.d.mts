export type GoldenEnvironment = {
  baseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  projectRef: string;
  operatorStatePath: string;
  reviewerStatePath: string;
  operator: { accessToken: string; userId: string };
  reviewer: { accessToken: string; userId: string };
};

export type GoldenWafer = {
  waferId: string;
  assignmentId: string;
  executionIds: string[];
  code: string;
};

export type GoldenScenario = {
  projectId: string;
  templateId: string;
  stageIds: string[];
  stepIds: string[];
  transitionIds: string[];
  wafers: GoldenWafer[];
};

export type GoldenCalendarScenario = GoldenScenario & {
  eventId: string;
  startsAt: string;
  endsAt: string;
};

export type GoldenManifest = {
  runId: string;
  runTag: string;
  scenarios: {
    calendarCreate: GoldenCalendarScenario;
    calendarMove: GoldenCalendarScenario;
    calendarDelete: GoldenCalendarScenario;
    stepCreate: GoldenScenario;
    transitionCreate: GoldenScenario;
    waferCreate: GoldenScenario;
    fullMove: GoldenScenario;
    batchMove: GoldenScenario;
    redo: GoldenScenario & { attemptId: string; redoTargetStepId: string };
    archive: GoldenScenario;
    mobileCalendarCreate: GoldenCalendarScenario;
    mobileStepCreate: GoldenScenario;
  };
};

export const manifestPath: string;
export function loadGoldenEnvironment(): GoldenEnvironment;
export function createGoldenClients(environment?: GoldenEnvironment): {
  admin: import("@supabase/supabase-js").SupabaseClient;
  operator: import("@supabase/supabase-js").SupabaseClient;
  reviewer: import("@supabase/supabase-js").SupabaseClient;
};
export function readManifest(): GoldenManifest;
export function writeManifest(manifest: unknown): void;
