import type { ReactNode } from "react";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe";

export default function WireframeLayout({ children }: { children: ReactNode }) {
  return <WaferWatchShell>{children}</WaferWatchShell>;
}
