import type { ReactNode } from "react";
import { signOut } from "@/features/accounts/actions";
import {
  createProcessTemplate,
  deleteProcessTemplate,
  updateProcessTemplateName
} from "@/features/process-flows/actions";
import { getWireframeShellModel } from "@/features/wireframe/queries";
import { selectActiveProcess } from "@/features/process-selection/actions";
import { resolveActiveProcess } from "@/features/process-selection/server";
import { requireAccountOrRedirect } from "@/lib/auth/session";
import { WaferWatchShell } from "@/ui/waferwatch-wireframe/components/WaferWatchShell";
import { RealtimeWorkflowBridge } from "@/features/collaboration/RealtimeWorkflowBridge";
import { getCalendarWeekRange } from "@/features/workspace/calendar-range";
import { getWorkspaceHotLoadingMode } from "@/features/workspace/mode";
import { getProcessHotBootstrap } from "@/features/workspace/queries";
import { WorkspaceSessionProvider } from "@/features/workspace/WorkspaceSessionProvider";
import { withServerPerformanceSpan } from "@/features/performance/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const account = await withServerPerformanceSpan("auth", {}, () => requireAccountOrRedirect());
  const activeProcess = await withServerPerformanceSpan("active-process.resolve", {}, () =>
    resolveActiveProcess(account));
  const hotLoadingMode = getWorkspaceHotLoadingMode();
  const range = getCalendarWeekRange();
  const [shell, initialBootstrap] = await Promise.all([
    withServerPerformanceSpan("shell.bootstrap", { processId: activeProcess?.id }, () =>
      getWireframeShellModel(account, activeProcess, {
        includeAggregateCounts: hotLoadingMode !== "on"
      })),
    activeProcess && hotLoadingMode !== "off"
      ? getProcessHotBootstrap(activeProcess.id, range.from, range.to).catch(() => null)
      : Promise.resolve(null)
  ]);

  return (
    <WorkspaceSessionProvider
      initialActiveProcessId={activeProcess?.id ?? null}
      initialBootstrap={initialBootstrap}
      mode={hotLoadingMode}
    >
      <WaferWatchShell
        shell={shell}
        onSignOut={signOut}
        onUpdateProcessName={updateProcessTemplateName}
        onCreateProcess={createProcessTemplate}
        onDeleteProcess={deleteProcessTemplate}
        onSelectProcess={selectActiveProcess}
      >
        <RealtimeWorkflowBridge
          activeProcessId={activeProcess?.id ?? null}
          hotLoadingMode={hotLoadingMode}
        />
        {children}
      </WaferWatchShell>
    </WorkspaceSessionProvider>
  );
}
