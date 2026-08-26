import { NextResponse } from "next/server";
import { z } from "zod";
import { getProcessArchiveItems } from "@/features/process-flows/queries";
import { getNextGreekWaferCode } from "@/features/process-flows/waferNaming";
import { requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const scopeSchema = z.enum(["archive", "reviewers", "wafer-name"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ processId: string }> }
) {
  await requireAccount();
  const { processId } = await context.params;
  const scope = scopeSchema.parse(new URL(request.url).searchParams.get("scope"));
  const supabase = await createServerSupabaseClient();
  const { data: template, error: templateError } = await supabase
    .from("process_templates")
    .select("id, owner_project_id")
    .eq("id", processId)
    .eq("is_active", true)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) return NextResponse.json({ error: "Process unavailable." }, { status: 404 });

  if (scope === "archive") {
    return NextResponse.json({ archiveItems: await getProcessArchiveItems(processId) }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  if (scope === "reviewers") {
    let eligibleIds: string[] = [];
    if (template.owner_project_id) {
      const [project, members] = await Promise.all([
        supabase.from("projects").select("owner_id").eq("id", template.owner_project_id).maybeSingle(),
        supabase.from("project_members").select("user_id").eq("project_id", template.owner_project_id).in("role", ["owner", "editor"])
      ]);
      if (project.error) throw project.error;
      if (members.error) throw members.error;
      eligibleIds = [project.data?.owner_id, ...(members.data ?? []).map((member) => member.user_id)]
        .filter((id): id is string => Boolean(id));
    } else {
      const admins = await supabase.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
      if (admins.error) throw admins.error;
      eligibleIds = (admins.data ?? []).map((profile) => profile.id);
    }
    const profiles = eligibleIds.length
      ? await supabase.from("profiles").select("id, display_name, email").in("id", [...new Set(eligibleIds)]).eq("is_active", true)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    return NextResponse.json({
      reviewerOptions: (profiles.data ?? []).map((profile) => ({
        id: profile.id,
        name: profile.display_name?.trim() || profile.email
      })).sort((left, right) => left.name.localeCompare(right.name))
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const assignmentRows = await supabase
    .from("wafer_process_assignments")
    .select("wafers(wafer_code)")
    .eq("template_id", processId)
    .is("deleted_at", null);
  if (assignmentRows.error) throw assignmentRows.error;
  const fallbackCodes = (assignmentRows.data ?? []).flatMap((row) => {
    const wafer = Array.isArray(row.wafers) ? row.wafers[0] : row.wafers;
    return wafer?.wafer_code ? [wafer.wafer_code] : [];
  });
  const allProjectWafers = template.owner_project_id
    ? await supabase.from("wafers").select("wafer_code").eq("project_id", template.owner_project_id).is("deleted_at", null)
    : { data: [], error: null };
  if (allProjectWafers.error) throw allProjectWafers.error;
  return NextResponse.json({
    suggestedWaferCode: getNextGreekWaferCode((allProjectWafers.data ?? []).map((wafer) => wafer.wafer_code).concat(fallbackCodes))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
