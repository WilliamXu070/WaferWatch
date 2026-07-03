import type { ReactNode } from "react";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe";

export default async function WireframeLayout({ children }: { children: ReactNode }) {
  const shell = await getWireframeShellModel();

  return <WaferWatchShell shell={shell}>{children}</WaferWatchShell>;
}
