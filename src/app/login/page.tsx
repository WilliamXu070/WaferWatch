import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForms } from "@/components/AuthForms";
import { getCurrentAccount } from "@/lib/auth/session";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const account = await getCurrentAccount();
  const params = await searchParams;

  if (account) {
    redirect("/");
  }

  return (
    <main className="page-shell">
      <nav className="topbar">
        <Link className="brand" href="/">WaferWatch</Link>
        <Link className="button button-secondary" href="/">Dashboard</Link>
      </nav>

      <section className="page-heading">
        <p className="eyebrow">McMaster Quantum Photonic Group</p>
        <h1>Account access</h1>
      </section>

      {params.error ? <p className="form-error auth-notice">{params.error}</p> : null}
      {params.message ? <p className="form-message auth-notice">{params.message}</p> : null}

      <AuthForms />
    </main>
  );
}
