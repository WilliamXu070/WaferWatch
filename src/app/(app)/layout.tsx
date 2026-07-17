import type { ReactNode } from "react";
import { signOut } from "@/features/accounts/actions";
import {
  createProcessTemplate,
  deleteProcessTemplate,
  updateProcessTemplateName
} from "@/features/process-flows/actions";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { requireAccountOrRedirect } from "@/lib/auth/session";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe";
import { RealtimeWorkflowBridge } from "@/features/collaboration/RealtimeWorkflowBridge";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const account = await requireAccountOrRedirect();
  const shell = await getWireframeShellModel(account);

  return (
    <WaferWatchShell
      shell={shell}
      onSignOut={signOut}
      onUpdateProcessName={updateProcessTemplateName}
      onCreateProcess={createProcessTemplate}
      onDeleteProcess={deleteProcessTemplate}
    >
      <RealtimeWorkflowBridge />
      {children}
    </WaferWatchShell>
  );
}
