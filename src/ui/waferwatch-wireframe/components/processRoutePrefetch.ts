import type { NavBasePath } from "../nav";

const processRoutePaths = ["/dashboard", "/calendar", "/process-flow", "/wafer-status"] as const;

export function getProcessRouteHrefs(processId: string, navBasePath: NavBasePath) {
  const query = `?processId=${encodeURIComponent(processId)}`;

  return processRoutePaths.map((path) => `${navBasePath}${path}${query}`);
}

/**
 * The current route is already loaded. Warm every other process section so a
 * normal navigation has an RSC payload waiting in the router cache.
 */
export function getProcessRoutesToPrefetch(
  processId: string,
  navBasePath: NavBasePath,
  pathname: string
) {
  return getProcessRouteHrefs(processId, navBasePath).filter(
    (href) => !href.startsWith(`${pathname}?`)
  );
}
