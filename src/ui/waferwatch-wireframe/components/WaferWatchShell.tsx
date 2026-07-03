import type { ReactNode } from "react";
import type { WireframeShellDto } from "@/features/wireframe/types";
import { WireframeSidebar } from "./WireframeSidebar";
import { WireframeTopbar } from "./WireframeTopbar";

export function WaferWatchShell({
  children,
  shell
}: {
  children: ReactNode;
  shell: WireframeShellDto;
}) {
  return (
    <div className="waferwatch-wireframe flex h-[100svh] w-full overflow-hidden bg-ww-bg text-ww-ink">
      <WireframeSidebar shell={shell} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WireframeTopbar />
        <main className="min-h-0 flex-1 overflow-auto bg-ww-bg">{children}</main>
      </div>
    </div>
  );
}
