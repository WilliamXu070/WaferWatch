import "server-only";

import { cookies, headers } from "next/headers";

export async function withServerPerformanceSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | null | undefined>,
  execute: () => Promise<T>
): Promise<T> {
  if (process.env.PERF_TEST_MODE !== "1") return execute();
  const startedAt = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    return await execute();
  } catch (error) {
    status = "error";
    throw error;
  } finally {
    const requestHeaders = await headers();
    const cookieStore = await cookies();
    const runId = requestHeaders.get("x-waferwatch-perf-run-id")
      ?? cookieStore.get("waferwatch_perf_run_id")?.value
      ?? "unscoped";
    console.info("[WaferWatchPerfSpan]", JSON.stringify({
      runId,
      name,
      status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...attributes
    }));
  }
}
