import type { ReactNode } from "react";
import type { WireframeShellDto } from "@/features/wireframe/types";
import { WireframeSidebar } from "./WireframeSidebar";
import { WireframeMobileChrome } from "./WireframeMobileChrome";
import { WireframeTopbar } from "./WireframeTopbar";
import { ProcessRoutePrefetcher } from "./ProcessRoutePrefetcher";
import type { CreateProcessAction, DeleteProcessAction, UpdateProcessNameAction } from "./shellActions";

export function WaferWatchShell({
  children,
  shell,
  onSignOut,
  onUpdateProcessName,
  onCreateProcess,
  onDeleteProcess
}: {
  children: ReactNode;
  shell: WireframeShellDto;
  onSignOut?: () => void | Promise<void>;
  onUpdateProcessName?: UpdateProcessNameAction;
  onCreateProcess?: CreateProcessAction;
  onDeleteProcess?: DeleteProcessAction;
}) {
  return (
    <div className="waferwatch-wireframe flex h-[100svh] w-full overflow-hidden bg-white text-[#151512]">
      <ProcessRoutePrefetcher
        defaultProcessId={shell.currentProcess?.id}
      />
      <WireframeMobileChrome
        shell={shell}
        onSignOut={onSignOut}
        onCreateProcess={onCreateProcess}
      />
      <WireframeSidebar
        shell={shell}
        onUpdateProcessName={onUpdateProcessName}
        onCreateProcess={onCreateProcess}
        onDeleteProcess={onDeleteProcess}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <WireframeTopbar
          currentUser={shell.currentUser}
          onSignOut={onSignOut}
        />
        <main className="wireframe-main min-h-0 flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
