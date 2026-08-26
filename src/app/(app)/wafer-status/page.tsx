import {
  getEmptyWaferStatusModel,
  getWaferStatusOverviewModel,
  getWaferStatusModel
} from "@/features/wafers/queries";
import { canEditProject, getCurrentAccount } from "@/lib/auth/session";
import { WaferStatusView } from "@/ui/waferwatch-wireframe/components/WaferStatusView";
import type { DieDetailTab } from "@/ui/waferwatch-wireframe/components/wafer-die-detail/waferDieDetailData";
import { resolveActiveProcess } from "@/features/process-selection/server";
import { getWorkspaceHotLoadingMode } from "@/features/workspace/mode";
import { LiveWaferStatusView } from "@/ui/waferwatch-wireframe/components/LiveWaferStatusView";
import { withServerPerformanceSpan } from "@/features/performance/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wafer / die status · WaferWatch"
};

type WaferStatusSearchParams = {
  waferId?: string | string[];
  dieLabel?: string | string[];
  tab?: string | string[];
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialDetailTab(value: string | undefined): DieDetailTab {
  return value === "history" ? "history" : "overview";
}

export default async function WireframeWaferStatusPage({
  searchParams
}: {
  searchParams: Promise<WaferStatusSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedWaferId = firstSearchValue(resolvedSearchParams.waferId);
  const requestedDieLabel = firstSearchValue(resolvedSearchParams.dieLabel);
  const requestedTab = getInitialDetailTab(firstSearchValue(resolvedSearchParams.tab));
  const account = await getCurrentAccount();

  if (!account) {
    return (
      <WaferStatusView
        model={getEmptyWaferStatusModel()}
        canEdit={false}
        processId=""
        emptyTitle="No wafer status data"
        emptyDescription="Sign in with access to wafer records. No wireframe fallback data is injected."
      />
    );
  }

  const activeProcess = await resolveActiveProcess(account);
  const activeProcessId = activeProcess?.id ?? null;

  if (!activeProcessId) {
    return (
      <WaferStatusView
        model={getEmptyWaferStatusModel()}
        canEdit={false}
        processId=""
        emptyTitle="No process selected"
        emptyDescription="Create or select an active process to view wafer and die status."
      />
    );
  }

  const hotLoadingMode = getWorkspaceHotLoadingMode();
  const model = hotLoadingMode === "on"
    ? await withServerPerformanceSpan("status.overview", { processId: activeProcessId }, () =>
      getWaferStatusOverviewModel(activeProcessId))
    : await getWaferStatusModel(activeProcessId);
  const projectIds = Array.from(
    new Set(
      model.families
        .flatMap((family) => family.tiles)
        .map((tile) => tile.projectId)
    )
  );
  const canEdit = account
    ? account.profile.role === "admin" ||
      (projectIds.length > 0 && (await Promise.all(projectIds.map((projectId) => canEditProject(projectId, account)))).every(Boolean))
    : false;

  const viewKey = [activeProcessId, requestedWaferId ?? "overview", requestedDieLabel ?? "", requestedTab].join(":");
  const viewProps = {
    canEdit,
    currentUser: account ? {
      id: account.userId,
      displayName: account.profile.display_name?.trim() || account.email?.trim() || "WaferWatch user"
    } : null,
    initialWaferId: requestedWaferId,
    initialDieLabel: requestedDieLabel,
    initialDetailTab: requestedTab
  };
  return hotLoadingMode === "on" ? (
    <LiveWaferStatusView key={viewKey} {...viewProps} initialModel={model} processId={activeProcessId} />
  ) : (
    <WaferStatusView key={viewKey} {...viewProps} model={model} processId={activeProcessId} />
  );
}
