import { DashboardView } from "@/ui/waferwatch-wireframe";
import { getWireframeDashboardModel } from "@/features/dashboard/queries";

export const metadata = {
  title: "Dashboard · WaferWatch wireframe"
};

export const dynamic = "force-dynamic";

export default async function WireframeDashboardPage() {
  const dashboard = await getWireframeDashboardModel();

  return <DashboardView dashboard={dashboard} />;
}
