import { redirect } from "next/navigation";
import { AuthForms } from "@/components/AuthForms";
import { confirmationRedirectPath } from "@/lib/auth/confirmation-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authPageStyles, cn } from "@/styles/tw";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{
    code?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
    message?: string;
    next?: string;
    token_hash?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const confirmationPath = confirmationRedirectPath(params);

  if (confirmationPath) {
    redirect(confirmationPath);
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (!claimsError && Boolean(claimsData?.claims?.sub)) {
    redirect("/dashboard");
  }

  return (
    <main className={authPageStyles.shell}>
      <div className={authPageStyles.shellInner}>
        <section className={authPageStyles.card}>
          <div className={authPageStyles.hero}>
            <p className={authPageStyles.eyebrow}>WaferWatch</p>
            <h1 className={authPageStyles.title}>Login</h1>
          </div>

          {params.error ? (
            <p className={cn(authPageStyles.notice, authPageStyles.noticeError)}>
              {params.error}
            </p>
          ) : null}
          {params.message ? (
            <p className={cn(authPageStyles.notice, authPageStyles.noticeMessage)}>
              {params.message}
            </p>
          ) : null}

          <AuthForms />
        </section>
      </div>
    </main>
  );
}
