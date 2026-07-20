const processRoutePaths = ["/dashboard", "/calendar", "/process-flow", "/wafer-status"] as const;

export function shouldFullyPrefetchProcessRoute(key: string) {
  return key === "process-flow" || key === "wafer-status";
}

export function getProcessRouteHrefs(processId: string) {
  const query = `?processId=${encodeURIComponent(processId)}`;

  return processRoutePaths.map((path) => `${path}${query}`);
}

/**
 * The current route is already loaded. Warm every other process section so a
 * normal navigation has an RSC payload waiting in the router cache.
 */
export function getProcessRoutesToPrefetch(
  processId: string,
  pathname: string
) {
  const hrefs = getProcessRouteHrefs(processId);
  const currentIndex = hrefs.findIndex((href) => href.startsWith(`${pathname}?`));
  if (currentIndex < 0) return hrefs;

  return [
    ...hrefs.slice(currentIndex + 1),
    ...hrefs.slice(0, currentIndex)
  ];
}
