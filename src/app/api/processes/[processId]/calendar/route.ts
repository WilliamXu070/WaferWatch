import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAccount, assertProjectAccess } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProcessCalendarSchedule } from "@/features/calendar/queries";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime()
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ processId: string }> }
) {
  try {
    const { processId } = await params;
    const parsed = querySchema.parse({
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to")
    });

    await requireAccount();

    const supabase = await createServerSupabaseClient();
    const templateResult = await supabase
      .from("process_templates")
      .select("owner_project_id")
      .eq("id", processId)
      .single();

    if (templateResult.error) {
      throw templateResult.error;
    }

    if (templateResult.data.owner_project_id) {
      await assertProjectAccess(templateResult.data.owner_project_id, "read");
    }

    const schedule = await getProcessCalendarSchedule(processId, parsed.from, parsed.to);

    return NextResponse.json(schedule);
  } catch (error) {
    const status = (error as { status?: number } | undefined)?.status ?? 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
