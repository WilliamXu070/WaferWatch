import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError, toErrorMessage } from "@/lib/errors";
import { getWaferTimeline } from "@/features/wafers/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ waferId: string }> }
) {
  try {
    const { waferId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: canAccess, error } = await supabase.rpc("can_access_wafer", {
      target_wafer_id: waferId
    });

    if (error || !canAccess) {
      throw new AppError("Wafer access denied.", 403);
    }

    const timeline = await getWaferTimeline(waferId);
    return NextResponse.json(timeline);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
