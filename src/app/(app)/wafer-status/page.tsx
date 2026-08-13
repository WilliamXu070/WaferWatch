import {
  getEmptyWaferStatusModel,
  getWaferStatusModel
} from "@/features/wafers/queries";
import { canEditProject, getCurrentAccount } from "@/lib/auth/session";
import { WaferStatusView } from "@/ui/waferwatch-wireframe/components/WaferStatusView";
import type { DieDetailTab } from "@/ui/waferwatch-wireframe/components/wafer-die-detail/waferDieDetailData";
import { resolveActiveProcess } from "@/features/process-selection/server";

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

  const model = await getWaferStatusModel(activeProcessId);
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

  return (
    <WaferStatusView
      key={[activeProcessId, requestedWaferId ?? "overview", requestedDieLabel ?? "", requestedTab].join(":")}
      model={model}
      canEdit={canEdit}
      currentUser={account ? {
        id: account.userId,
        displayName: account.profile.display_name?.trim() || account.email?.trim() || "WaferWatch user"
      } : null}
      processId={activeProcessId}
      initialWaferId={requestedWaferId}
      initialDieLabel={requestedDieLabel}
      initialDetailTab={requestedTab}
    />
  );
}
