import { EmailConfirmation } from "@/components/EmailConfirmation";
import { safeAuthRedirectPath } from "@/lib/auth/password-recovery";
import { authPageStyles } from "@/styles/tw";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm email · WaferWatch", referrer: "no-referrer" };

export default async function FinishEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <main className={authPageStyles.shell}>
      <div className={authPageStyles.shellInner}>
        <section className={authPageStyles.card}>
          <p className={authPageStyles.eyebrow}>WaferWatch</p>
          <h1 className={authPageStyles.title}>Confirm email</h1>
          <EmailConfirmation next={safeAuthRedirectPath(params.next)} />
        </section>
      </div>
    </main>
  );
}
