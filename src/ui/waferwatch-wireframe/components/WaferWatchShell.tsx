import type { ReactNode } from "react";
import { WireframeSidebar } from "./WireframeSidebar";
import { WireframeTopbar } from "./WireframeTopbar";

export function WaferWatchShell({ children }: { children: ReactNode }) {
  return (
    <div className="waferwatch-wireframe flex h-[100svh] w-full overflow-hidden bg-ww-bg text-ww-ink">
      <WireframeSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <WireframeTopbar />
        <main className="min-h-0 flex-1 overflow-auto bg-ww-bg">{children}</main>
      </div>
    </div>
  );
}
