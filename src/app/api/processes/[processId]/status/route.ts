import { NextResponse } from "next/server";
import {
  getWaferStatusHistoryTile,
  getWaferStatusOverviewModel
} from "@/features/wafers/queries";
import { requireAccount } from "@/lib/auth/session";
import { withServerPerformanceSpan } from "@/features/performance/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ processId: string }> }
) {
  await requireAccount();
  const { processId } = await context.params;
  const url = new URL(request.url);
  const assignmentId = url.searchParams.get("assignmentId");
  const dieLabel = url.searchParams.get("dieLabel") ?? undefined;
  const payload = assignmentId
    ? await withServerPerformanceSpan("status.history", { processId, assignmentId }, () =>
      getWaferStatusHistoryTile(processId, assignmentId, dieLabel))
    : await withServerPerformanceSpan("status.overview", { processId }, () =>
      getWaferStatusOverviewModel(processId));
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
