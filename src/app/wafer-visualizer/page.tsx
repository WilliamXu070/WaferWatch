import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/features/accounts/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WaferCutVisualizer } from "@/components/WaferCutVisualizer";

export const dynamic = "force-dynamic";

export default async function WaferVisualizerPage({
  searchParams
}: {
  searchParams: Promise<{ preview?: string | string[]; waferStateName?: string | string[] }>;
}) {
  const previewParam = (await searchParams).preview;
  const previewStateParam = (await searchParams).waferStateName;
  const isPreviewMode =
    process.env.NODE_ENV === "development" && (Array.isArray(previewParam) ? previewParam[0] : previewParam) === "1";
  const previewWaferState = isPreviewMode
    ? Array.isArray(previewStateParam)
      ? previewStateParam[0]
      : previewStateParam
    : undefined;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (!isPreviewMode && (claimsError || !claimsData?.claims?.sub)) {
    redirect("/");
  }

  return (
    <main className="page-shell">
      <section className="page-heading" style={{ width: "100%", alignItems: "center" }}>
        <div>
          <p className="eyebrow">WaferWatch</p>
          <h1>Wafer visualizer</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/dashboard" className="button button-secondary">
            Back to dashboard
          </Link>
          <form action={signOut}>
            <button className="button button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>

      <section className="panel">
          <WaferCutVisualizer waferStateName={previewWaferState} />
      </section>
    </main>
  );
}
