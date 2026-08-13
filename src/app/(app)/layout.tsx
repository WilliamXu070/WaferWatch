import type { ReactNode } from "react";
import { signOut } from "@/features/accounts/actions";
import {
  createProcessTemplate,
  deleteProcessTemplate,
  updateProcessTemplateName
} from "@/features/process-flows/actions";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { selectActiveProcess } from "@/features/process-selection/actions";
import { resolveActiveProcess } from "@/features/process-selection/server";
import { requireAccountOrRedirect } from "@/lib/auth/session";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe/components/WaferWatchShell";
import { RealtimeWorkflowBridge } from "@/features/collaboration/RealtimeWorkflowBridge";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const account = await requireAccountOrRedirect();
  const activeProcess = await resolveActiveProcess(account);
  const shell = await getWireframeShellModel(account, activeProcess);

  return (
    <WaferWatchShell
      shell={shell}
      onSignOut={signOut}
      onUpdateProcessName={updateProcessTemplateName}
      onCreateProcess={createProcessTemplate}
      onDeleteProcess={deleteProcessTemplate}
      onSelectProcess={selectActiveProcess}
    >
      <RealtimeWorkflowBridge activeProcessId={activeProcess?.id ?? null} />
      {children}
    </WaferWatchShell>
  );
}
