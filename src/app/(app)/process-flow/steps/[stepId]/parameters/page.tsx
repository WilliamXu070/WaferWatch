import { redirect } from "next/navigation";
import { StepParametersEditor } from "@/components/process-flow/StepParametersEditor";
import { updateProcessStepParameters } from "@/features/process-flows/actions";
import {
  getProcessFlowFallbackHref,
  isPersistedProcessStepId
} from "@/features/process-flows/stepParameterRoute";
import { canEditProject, canManageProcessLibrary, requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Step parameters · WaferWatch"
};

export default async function StepParametersPage({
  params,
  searchParams
}: {
  params: Promise<{ stepId: string }>;
  searchParams: Promise<{ processId?: string | string[] }>;
}) {
  const { stepId } = await params;
  const { processId: rawProcessId } = await searchParams;
  const processId = typeof rawProcessId === "string" ? rawProcessId : undefined;
  const processFlowHref = getProcessFlowFallbackHref(processId);

  if (!isPersistedProcessStepId(stepId)) {
    redirect(processFlowHref);
  }

  const account = await requireAccount();
  const supabase = await createServerSupabaseClient();
  const { data: step, error: stepError } = await supabase
    .from("process_steps")
    .select("*")
    .eq("id", stepId)
    .maybeSingle();

  if (stepError) {
    throw new Error(`Unable to load process step parameters: ${stepError.message}`);
  }
  if (!step) {
    redirect(processFlowHref);
  }

  const { data: process, error: processError } = await supabase
    .from("process_templates")
    .select("id, name, owner_project_id")
    .eq("id", step.template_id)
    .maybeSingle();

  if (processError) {
    throw new Error(`Unable to load process template: ${processError.message}`);
  }
  if (!process) {
    redirect(processFlowHref);
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
