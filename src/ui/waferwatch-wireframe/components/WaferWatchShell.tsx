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

export function WaferWatchShell({
  children,
  shell,
  navBasePath = "",
  onSignOut,
  onUpdateProcessName
}: {
  children: ReactNode;
  shell: WireframeShellDto;
  navBasePath?: NavBasePath;
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
          onSignOut={onSignOut}
        />
        <main className="wireframe-main min-h-0 flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
