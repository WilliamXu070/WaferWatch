import {
  ACTIVE_PROCESS_DESTINATIONS,
  isProcessUuid
} from "./selection";

export type LegacyProcessSelectionRedirect = {
  processId: string | null;
  destination: string;
};

const PRODUCT_ROUTE_PATHS = new Set<string>(ACTIVE_PROCESS_DESTINATIONS);

export function getLegacyProcessSelectionRedirect(
  requestUrl: URL
): LegacyProcessSelectionRedirect | null {
  if (PRODUCT_ROUTE_PATHS.has(requestUrl.pathname) && requestUrl.searchParams.has("processId")) {
    const candidate = requestUrl.searchParams.get("processId");
    const cleanUrl = new URL(requestUrl);
    cleanUrl.searchParams.delete("processId");

    return {
      processId: isProcessUuid(candidate) ? candidate : null,
      destination: `${cleanUrl.pathname}${cleanUrl.search}`
    };
  }

  const processPathMatch = requestUrl.pathname.match(/^\/processes\/([^/]+)\/?$/);
  if (!processPathMatch) return null;

  let candidate = processPathMatch[1] ?? "";
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    candidate = "";
  }
  return {
    processId: isProcessUuid(candidate) ? candidate : null,
    destination: "/process-flow"
  };
}
