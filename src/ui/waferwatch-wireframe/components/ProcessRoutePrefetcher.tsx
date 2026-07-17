"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const selectedProcessId = useSearchParams().get("processId");
  const processId = selectedProcessId ?? defaultProcessId ?? null;

  useEffect(() => {
    if (!processId) return;

    const prefetch = () => {
      for (const href of getProcessRouteHrefs(processId, navBasePath)) {
        router.prefetch(href);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timerId = window.setTimeout(prefetch, 160);
    return () => window.clearTimeout(timerId);
  }, [navBasePath, processId, router]);

  return null;
}
