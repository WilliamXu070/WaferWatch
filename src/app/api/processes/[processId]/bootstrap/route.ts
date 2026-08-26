import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";
import { getCalendarWeekRange } from "@/features/workspace/calendar-range";
import { getProcessHotBootstrap } from "@/features/workspace/queries";

export const dynamic = "force-dynamic";

const rangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime()
}).refine(({ from, to }) => {
  const duration = Date.parse(to) - Date.parse(from);
  return duration > 0 && duration <= 8 * 24 * 60 * 60 * 1000;
}, "The bootstrap range must be greater than zero and no more than eight days.");

export async function GET(
  request: Request,
  context: { params: Promise<{ processId: string }> }
) {
  await requireAccount();
  const { processId } = await context.params;
  const url = new URL(request.url);
  const fallback = getCalendarWeekRange();
  const range = rangeSchema.parse({
    from: url.searchParams.get("from") ?? fallback.from,
    to: url.searchParams.get("to") ?? fallback.to
  });
  return NextResponse.json(
    await getProcessHotBootstrap(processId, range.from, range.to),
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
