import type { ReactNode } from "react";
import { signOut } from "@/features/accounts/actions";
import {
  createWaferAtProcessStart,
  updateProcessTemplateName
} from "@/features/process-flows/actions";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { requireAccountOrRedirect } from "@/lib/auth/session";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAccountOrRedirect();
  const shell = await getWireframeShellModel();

  return (
    <WaferWatchShell
      shell={shell}
      onCreateWaferAtProcessStart={createWaferAtProcessStart}
      onSignOut={signOut}
      onUpdateProcessName={updateProcessTemplateName}
    >
      {children}
    </WaferWatchShell>
  );
}
