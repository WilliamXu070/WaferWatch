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

export default async function WireframeDashboardPage() {
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

  const dashboard = await getWireframeDashboardModel(supabase);

  return <DashboardView dashboard={dashboard} />;
}
