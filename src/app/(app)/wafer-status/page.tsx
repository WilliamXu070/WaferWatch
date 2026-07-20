import {
  getEmptyWaferStatusModel,
  getWaferStatusModel
} from "@/features/wafers/queries";
import { canEditProject, getCurrentAccount } from "@/lib/auth/session";
import { WaferStatusView } from "@/ui/waferwatch-wireframe/components/WaferStatusView";
import type { DieDetailTab } from "@/ui/waferwatch-wireframe/components/wafer-die-detail/waferDieDetailData";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wafer / die status · WaferWatch"
};

type WaferStatusSearchParams = {
  processId?: string | string[];
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
  const requestedProcessId = firstSearchValue(resolvedSearchParams.processId);
  const requestedWaferId = firstSearchValue(resolvedSearchParams.waferId);
  const requestedDieLabel = firstSearchValue(resolvedSearchParams.dieLabel);
  const requestedTab = getInitialDetailTab(firstSearchValue(resolvedSearchParams.tab));
  if (!requestedProcessId) {
    return (
      <WaferStatusView
        model={getEmptyWaferStatusModel()}
        canEdit={false}
        processId=""
        emptyTitle="No process selected"
        emptyDescription="Select a process first. Wafer / die status stays hidden until a process and this sub-view are selected."
      />
    );
  }

  const account = await getCurrentAccount();

  if (!account) {
    return (
      <WaferStatusView
        model={getEmptyWaferStatusModel()}
        canEdit={false}
        processId={requestedProcessId}
        emptyTitle="No wafer status data"
        emptyDescription="Sign in with access to wafer records. No wireframe fallback data is injected."
      />
    );
  }

  const model = await getWaferStatusModel(requestedProcessId);
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
      key={[requestedProcessId, requestedWaferId ?? "overview", requestedDieLabel ?? "", requestedTab].join(":")}
      model={model}
      canEdit={canEdit}
      currentUser={account ? {
        id: account.userId,
        displayName: account.profile.display_name?.trim() || account.email?.trim() || "WaferWatch user"
      } : null}
      processId={requestedProcessId}
      initialWaferId={requestedWaferId}
      initialDieLabel={requestedDieLabel}
      initialDetailTab={requestedTab}
    />
  );
}
