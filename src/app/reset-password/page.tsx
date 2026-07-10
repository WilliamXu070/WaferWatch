import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authPageStyles } from "@/styles/tw";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset password · WaferWatch"
};

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (
    claimsError ||
    !claimsData?.claims?.sub ||
    cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== "1"
  ) {
    redirect("/?error=Open a valid password reset link to choose a new password.");
  }

  return (
    <main className={authPageStyles.shell}>
      <div className={authPageStyles.shellInner}>
        <section className={authPageStyles.card}>
          <div className={authPageStyles.hero}>
            <p className={authPageStyles.eyebrow}>WaferWatch</p>
            <h1 className={authPageStyles.title}>Choose a new password</h1>
          </div>
          <p className={authPageStyles.supportingCopy}>Use at least 8 characters. This will replace your current password.</p>
          <ResetPasswordForm />
        </section>
      </div>
    </main>
  );
}
