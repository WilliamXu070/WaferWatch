import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { WireframeShellDto } from "@/features/wireframe/types";
import { WireframeSidebar } from "./WireframeSidebar";
import { WireframeTopbar } from "./WireframeTopbar";

type UpdateProcessNameAction = (input: {
  templateId: string;
  name: string;
}) => Promise<ActionResult<{ id: string; name: string; version: string }>>;

export function WaferWatchShell({
  children,
  shell,
  onUpdateProcessName
}: {
  children: ReactNode;
  shell: WireframeShellDto;
  onUpdateProcessName?: UpdateProcessNameAction;
}) {
  return (
    <div className="waferwatch-wireframe flex h-[100svh] w-full overflow-hidden bg-white text-[#151512]">
      <WireframeSidebar shell={shell} onUpdateProcessName={onUpdateProcessName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WireframeTopbar />
        <main className="min-h-0 flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
