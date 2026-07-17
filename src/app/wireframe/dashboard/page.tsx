import { DashboardView } from "@/ui/waferwatch-wireframe/components/DashboardView";
import {
  getEmptyWireframeDashboardModel,
  getWireframeDashboardModel
} from "@/features/dashboard/queries";
import { getCurrentAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard · WaferWatch wireframe"
};

export const dynamic = "force-dynamic";

type DashboardSearchParams = {
  processId?: string | string[];
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WireframeDashboardPage({
  searchParams
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  const account = await getCurrentAccount();

  if (!account) {
    return (
      <DashboardView
        dashboard={getEmptyWireframeDashboardModel()}
        emptyTitle="No dashboard data"
        emptyDescription="Sign in with access to process templates and wafer assignments. No wireframe fallback data is injected."
      />
    );
  }

  const supabase = await createServerSupabaseClient();
  const dashboard = await getWireframeDashboardModel(supabase, requestedProcessId);

  return <DashboardView dashboard={dashboard} />;
}
