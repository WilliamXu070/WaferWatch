import { DashboardView } from "@/ui/waferwatch-wireframe";
import {
  getEmptyWireframeDashboardModel,
  getWireframeDashboardModel
} from "@/features/dashboard/queries";
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
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return (
      <DashboardView
        dashboard={getEmptyWireframeDashboardModel()}
        emptyTitle="No dashboard data"
        emptyDescription="Sign in with access to process templates and wafer assignments. No wireframe fallback data is injected."
      />
    );
  }

  const dashboard = await getWireframeDashboardModel(supabase, requestedProcessId);

  return <DashboardView dashboard={dashboard} />;
}
