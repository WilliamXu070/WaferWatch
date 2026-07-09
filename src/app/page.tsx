import { redirect } from "next/navigation";
import { AuthForms } from "@/components/AuthForms";
import { confirmationRedirectPath } from "@/lib/auth/confirmation-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authPageStyles, cn } from "@/styles/tw";

export const dynamic = "force-dynamic";

function authErrorMessage(params: {
  error?: string;
  error_code?: string;
  error_description?: string;
}) {
  if (params.error_code === "otp_expired") {
    return "This confirmation link has expired or was already used. Request a new one below.";
  }

  return params.error_description ?? params.error ?? null;
}

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

  const authError = authErrorMessage(params);
  const showExpiredConfirmation = params.error_code === "otp_expired";

  return (
    <main className={authPageStyles.shell}>
      <div className={authPageStyles.shellInner}>
        <section className={authPageStyles.card}>
          <div className={authPageStyles.hero}>
            <p className={authPageStyles.eyebrow}>WaferWatch</p>
            <h1 className={authPageStyles.title}>Login</h1>
          </div>

          {authError ? (
            <p className={cn(authPageStyles.notice, authPageStyles.noticeError)}>
              {authError}
            </p>
          ) : null}
          {params.message ? (
            <p className={cn(authPageStyles.notice, authPageStyles.noticeMessage)}>
              {params.message}
            </p>
          ) : null}

          <AuthForms showExpiredConfirmation={showExpiredConfirmation} />
        </section>
      </div>
    </main>
  );
}
