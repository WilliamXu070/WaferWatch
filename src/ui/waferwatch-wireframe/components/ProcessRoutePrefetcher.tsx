"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { NavBasePath } from "../nav";

function getProcessRouteHrefs(processId: string, navBasePath: NavBasePath) {
  const query = `?processId=${encodeURIComponent(processId)}`;

  return [
    `${navBasePath}/dashboard${query}`,
    `${navBasePath}/calendar${query}`,
    `${navBasePath}/process-flow${query}`,
    `${navBasePath}/wafer-status${query}`
  ];
}

/**
 * Warms the authenticated process views while the persistent shell is idle.
 * This keeps the router cache hot without retaining every heavy view in the DOM.
 */
export function ProcessRoutePrefetcher({
  defaultProcessId,
  navBasePath = ""
}: {
  defaultProcessId?: string | null;
  navBasePath?: NavBasePath;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const selectedProcessId = useSearchParams().get("processId");
  const processId = selectedProcessId ?? defaultProcessId ?? null;

  useEffect(() => {
    if (!processId) return;

    const routePaths = ["/dashboard", "/calendar", "/process-flow", "/wafer-status"];
    const currentIndex = routePaths.findIndex((route) => pathname === `${navBasePath}${route}`);
    const nextHref = getProcessRouteHrefs(processId, navBasePath)[
      (currentIndex + 1 + routePaths.length) % routePaths.length
    ];

    if (!nextHref) return;

    const prefetch = () => {
      router.prefetch(nextHref);
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timerId = window.setTimeout(prefetch, 160);
    return () => window.clearTimeout(timerId);
  }, [navBasePath, pathname, processId, router]);

  return null;
}
