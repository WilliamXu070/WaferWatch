import { NextResponse } from "next/server";
import { getWireframeDashboardModel } from "@/features/dashboard/queries";
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
  return NextResponse.json(await getWireframeDashboardModel(supabase, processId), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
