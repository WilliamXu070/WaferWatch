import type { ReactNode } from "react";
import { signOut } from "@/features/accounts/actions";
import {
  createProcessTemplate,
  deleteProcessTemplate,
  updateProcessTemplateName
} from "@/features/process-flows/actions";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe";
import { RealtimeWorkflowBridge } from "@/features/collaboration/RealtimeWorkflowBridge";

export default async function WireframeLayout({ children }: { children: ReactNode }) {
  const shell = await getWireframeShellModel();

  return (
    <WaferWatchShell
      shell={shell}
      navBasePath="/wireframe"
      onSignOut={signOut}
      onUpdateProcessName={updateProcessTemplateName}
      onCreateProcess={createProcessTemplate}
      onDeleteProcess={deleteProcessTemplate}
    >
      <RealtimeWorkflowBridge enabled={Boolean(shell.currentUser)} />
      {children}
    </WaferWatchShell>
  );
}
