import { DashboardView } from "@/ui/waferwatch-wireframe/components/DashboardView";
import {
  getEmptyWireframeDashboardModel,
  getWireframeDashboardModel
} from "@/features/dashboard/queries";
import { getCurrentAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveActiveProcess } from "@/features/process-selection/server";

export const metadata = {
  title: "Dashboard · WaferWatch"
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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
  const activeProcess = await resolveActiveProcess(account);
  const dashboard = await getWireframeDashboardModel(supabase, activeProcess?.id ?? null);

  return <DashboardView dashboard={dashboard} />;
}
