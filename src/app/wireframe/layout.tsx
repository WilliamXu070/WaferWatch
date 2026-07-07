import type { ReactNode } from "react";
import { signOut } from "@/features/accounts/actions";
import {
  createWaferAtProcessStart,
  updateProcessTemplateName
} from "@/features/process-flows/actions";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe";

export default async function WireframeLayout({ children }: { children: ReactNode }) {
  const shell = await getWireframeShellModel();

  return (
    <WaferWatchShell
      shell={shell}
      navBasePath="/wireframe"
      onCreateWaferAtProcessStart={createWaferAtProcessStart}
      onSignOut={signOut}
      onUpdateProcessName={updateProcessTemplateName}
    >
      {children}
    </WaferWatchShell>
  );
}
