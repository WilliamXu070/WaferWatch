import { NextResponse, type NextRequest } from "next/server";
import { requireAccount, assertProjectAccess } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ processId: string }> }
) {
  try {
    const { processId } = await params;

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

    const [stepsResult, wafersResult] = await Promise.all([
      supabase
        .from("process_steps")
        .select("id, name")
        .eq("template_id", processId)
        .order("step_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("wafer_process_assignments")
        .select("wafers(id, wafer_code)")
        .eq("template_id", processId)
        .in("status", ["planned", "queued", "in_progress", "on_hold"])
        .order("assigned_at", { ascending: false })
    ]);

    if (stepsResult.error) {
      throw stepsResult.error;
    }

    if (wafersResult.error) {
      throw wafersResult.error;
    }

    const wafers = (wafersResult.data ?? [])
      .map((row) => (Array.isArray(row.wafers) ? row.wafers[0] : row.wafers))
      .filter((wafer): wafer is { id: string; wafer_code: string } => Boolean(wafer?.id));

    return NextResponse.json({
      steps: stepsResult.data ?? [],
      wafers
    });
  } catch (error) {
    const status = (error as { status?: number } | undefined)?.status ?? 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
