import { NextResponse, type NextRequest } from "next/server";
import { assertProjectAccess } from "@/lib/auth/session";
import { AppError, toErrorMessage } from "@/lib/errors";
import { getProjectMetricSummary } from "@/features/metrics/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await assertProjectAccess(projectId, "read");
    const summary = await getProjectMetricSummary(projectId);
    return NextResponse.json(summary);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
