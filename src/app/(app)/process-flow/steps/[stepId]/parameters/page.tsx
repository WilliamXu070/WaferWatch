import { notFound } from "next/navigation";
import { StepParametersEditor } from "@/components/process-flow/StepParametersEditor";
import { updateProcessStepParameters } from "@/features/process-flows/actions";
import { canEditProject, canManageProcessLibrary, requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Step parameters · WaferWatch"
};

export default async function StepParametersPage({
  params
}: {
  params: Promise<{ stepId: string }>;
}) {
  const { stepId } = await params;
  const account = await requireAccount();
  const supabase = await createServerSupabaseClient();
  const { data: step, error: stepError } = await supabase
    .from("process_steps")
    .select("*")
    .eq("id", stepId)
    .maybeSingle();

  if (stepError || !step) {
    notFound();
  }

  const { data: process, error: processError } = await supabase
    .from("process_templates")
    .select("id, name, owner_project_id")
    .eq("id", step.template_id)
    .maybeSingle();

  if (processError || !process) {
    notFound();
  }

  const canEdit = canManageProcessLibrary(account.profile.role) && (
    !process.owner_project_id || await canEditProject(process.owner_project_id)
  );

  return (
    <StepParametersEditor
      step={step}
      processName={process.name}
      canEdit={canEdit}
      onSave={updateProcessStepParameters}
    />
  );
}
