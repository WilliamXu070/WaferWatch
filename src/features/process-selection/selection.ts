export const ACTIVE_PROCESS_COOKIE_NAME = "waferwatch_active_process_v1";

export const ACTIVE_PROCESS_DESTINATIONS = [
  "/dashboard",
  "/calendar",
  "/analysis",
  "/process-flow",
  "/wafer-status"
] as const;

export type ActiveProcessDestination = typeof ACTIVE_PROCESS_DESTINATIONS[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProcessUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function isActiveProcessDestination(value: string): value is ActiveProcessDestination {
  return (ACTIVE_PROCESS_DESTINATIONS as readonly string[]).includes(value);
}

export function parseActiveProcessSelection(input: unknown): {
  processId: string;
  destination: ActiveProcessDestination;
} | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.processId !== "string" || !isProcessUuid(value.processId)) return null;
  if (typeof value.destination !== "string" || !isActiveProcessDestination(value.destination)) return null;
  return {
    processId: value.processId,
    destination: value.destination
  };
}

export function getActiveProcessCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure
  };
}

export async function resolveActiveProcessCandidate<T>(
  candidate: string | null | undefined,
  getCandidate: (processId: string) => Promise<T | null>,
  getFallback: () => Promise<T | null>
) {
  if (isProcessUuid(candidate)) {
    const selected = await getCandidate(candidate);
    if (selected) return selected;
  }

  return getFallback();
}
