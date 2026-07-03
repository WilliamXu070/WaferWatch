import {
  getEmptyWaferStatusModel,
  getWaferStatusModel
} from "@/features/wafers/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WaferStatusView } from "@/ui/waferwatch-wireframe";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wafer / die status · WaferWatch wireframe"
};

type WaferStatusSearchParams = {
  processId?: string | string[];
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WireframeWaferStatusPage({
  searchParams
}: {
  searchParams: Promise<WaferStatusSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  if (!requestedProcessId) {
    return (
      <WaferStatusView
        model={getEmptyWaferStatusModel()}
        emptyTitle="No process selected"
        emptyDescription="Select a process first. Wafer / die status stays hidden until a process and this sub-view are selected."
      />
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return (
      <WaferStatusView
        model={getEmptyWaferStatusModel()}
        emptyTitle="No wafer status data"
        emptyDescription="Sign in with access to wafer records. No wireframe fallback data is injected."
      />
    );
  }

  const model = await getWaferStatusModel(requestedProcessId);

  return <WaferStatusView model={model} />;
}
