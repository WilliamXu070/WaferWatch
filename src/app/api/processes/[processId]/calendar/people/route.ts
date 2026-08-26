import { NextResponse } from "next/server";
import { listProcessPeople } from "@/features/calendar/queries";
import { requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ processId: string }> }
) {
  await requireAccount();
  const { processId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("id")
    .eq("id", processId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return NextResponse.json({ error: "Process unavailable." }, { status: 404 });
  return NextResponse.json(await listProcessPeople(), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
