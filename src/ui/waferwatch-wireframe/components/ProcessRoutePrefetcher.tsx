"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { NavBasePath } from "../nav";
import { getProcessRoutesToPrefetch } from "./processRoutePrefetch";

/**
 * Warms every authenticated process view after the page load completes. Requests
 * are intentionally serialized across idle slices so Calendar's heavier RSC
 * payload cannot contend with the rest of the application shell.
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

    const pendingHrefs = getProcessRoutesToPrefetch(processId, navBasePath, pathname);
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    let nextIndex = 0;

    const scheduleNext = () => {
      if (cancelled || nextIndex >= pendingHrefs.length) return;

      const prefetchNext = () => {
        if (cancelled) return;

        const href = pendingHrefs[nextIndex++];
        if (href) router.prefetch(href);

        // Leave enough breathing room for the router to start this request
        // before beginning the next route's payload.
        timeoutId = window.setTimeout(scheduleNext, 120);
      };

      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(prefetchNext, { timeout: 1200 });
        return;
      }

      timeoutId = window.setTimeout(prefetchNext, 0);
    };

    const startAfterLoad = () => scheduleNext();

    if (document.readyState === "complete") {
      startAfterLoad();
    } else {
      window.addEventListener("load", startAfterLoad, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", startAfterLoad);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [navBasePath, pathname, processId, router]);

  return null;
}
