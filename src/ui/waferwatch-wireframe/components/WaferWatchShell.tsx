import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { WireframeShellDto } from "@/features/wireframe/types";
import type { NavBasePath } from "../nav";
import { WireframeSidebar } from "./WireframeSidebar";
import { WireframeTopbar } from "./WireframeTopbar";

export type UpdateProcessNameAction = (input: {
  templateId: string;
  name: string;
}) => Promise<ActionResult<{ id: string; name: string; version: string }>>;

export type CreateWaferAtProcessStartAction = (input: {
  templateId: string;
  waferCode: string;
}) => Promise<ActionResult<unknown>>;

export function WaferWatchShell({
  children,
  shell,
  navBasePath = "",
  onCreateWaferAtProcessStart,
  onSignOut,
  onUpdateProcessName
}: {
  children: ReactNode;
  shell: WireframeShellDto;
  navBasePath?: NavBasePath;
  onCreateWaferAtProcessStart?: CreateWaferAtProcessStartAction;
  onSignOut?: () => void | Promise<void>;
  onUpdateProcessName?: UpdateProcessNameAction;
}) {
  return (
    <div className="waferwatch-wireframe flex h-[100svh] w-full overflow-hidden bg-white text-[#151512]">
      <WireframeSidebar
        shell={shell}
        navBasePath={navBasePath}
        onUpdateProcessName={onUpdateProcessName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <WireframeTopbar
          onCreateWaferAtProcessStart={onCreateWaferAtProcessStart}
          onSignOut={onSignOut}
        />
        <main className="wireframe-main min-h-0 flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
