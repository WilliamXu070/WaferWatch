import { redirect } from "next/navigation";
import { getWaferStatusModel } from "@/features/wafers/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WaferStatusView } from "@/ui/waferwatch-wireframe";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wafer / die status · WaferWatch wireframe"
};

export default async function WireframeWaferStatusPage() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/");
  }

  const model = await getWaferStatusModel();

  return <WaferStatusView model={model} />;
}
