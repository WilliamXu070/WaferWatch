import { redirect } from "next/navigation";
import { AuthForms } from "@/components/AuthForms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const params = await searchParams;

  if (!claimsError && Boolean(claimsData?.claims?.sub)) {
    redirect("/processes");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-hero">
          <p className="eyebrow">WaferWatch</p>
          <h1>LOGIN</h1>
        </div>

        {params.error ? <p className="form-error auth-notice">{params.error}</p> : null}
        {params.message ? <p className="form-message auth-notice">{params.message}</p> : null}

        <AuthForms />
      </section>
    </main>
  );
}
