import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertProjectAccess } from "@/lib/auth/session";
import { AppError, toErrorMessage } from "@/lib/errors";
import { getCalendarEvents } from "@/features/calendar/queries";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime()
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const parsed = querySchema.parse({
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to")
    });

    await assertProjectAccess(projectId, "read");
    const events = await getCalendarEvents(projectId, parsed.from, parsed.to);
    return NextResponse.json(events);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
