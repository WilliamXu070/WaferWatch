import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { WireframeShellDto } from "@/features/wireframe/types";
import type { NavBasePath } from "../nav";
import { WireframeSidebar } from "./WireframeSidebar";
import { WireframeMobileChrome } from "./WireframeMobileChrome";
import { WireframeTopbar } from "./WireframeTopbar";

export type UpdateProcessNameAction = (input: {
  templateId: string;
  name: string;
}) => Promise<ActionResult<{ id: string; name: string; version: string }>>;

export type CreateProcessAction = (input: {
  name: string;
  version?: string;
  description?: string | null;
  ownerProjectId?: string | null;
  isActive?: boolean;
}) => Promise<ActionResult<{ id: string; name: string; version: string }>>;

export type DeleteProcessAction = (input: {
  templateId: string;
}) => Promise<ActionResult<{ deleted: string }>>;

export function WaferWatchShell({
  children,
  shell,
  navBasePath = "",
  onSignOut,
  onUpdateProcessName,
  onCreateProcess,
  onDeleteProcess
}: {
  children: ReactNode;
  shell: WireframeShellDto;
  navBasePath?: NavBasePath;
  onSignOut?: () => void | Promise<void>;
  onUpdateProcessName?: UpdateProcessNameAction;
  onCreateProcess?: CreateProcessAction;
  onDeleteProcess?: DeleteProcessAction;
}) {
  return (
    <div className="waferwatch-wireframe flex h-[100svh] w-full overflow-hidden bg-white text-[#151512]">
      <WireframeMobileChrome
        shell={shell}
        navBasePath={navBasePath}
        onSignOut={onSignOut}
        onCreateProcess={onCreateProcess}
      />
      <WireframeSidebar
        shell={shell}
        navBasePath={navBasePath}
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
