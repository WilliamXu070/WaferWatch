import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/features/accounts/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listProcessTemplates } from "@/features/process-flows/queries";

export const dynamic = "force-dynamic";

function getStatusClass(isActive: boolean) {
  return isActive ? "status-pill status-pill--active" : "status-pill status-pill--inactive";
}

export default async function ProcessesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/");
  }

  const processes = await listProcessTemplates();
  const activeCount = processes.filter((process) => process.is_active).length;

  return (
    <main className="page-shell">
      <section className="page-heading" style={{ width: "100%", alignItems: "center" }}>
        <div>
          <p className="eyebrow">WaferWatch</p>
          <h1>Processes</h1>
        </div>
        <form action={signOut}>
          <button className="button button-secondary" type="submit">
            Sign out
          </button>
        </form>
      </section>

      <p className="hero-copy" style={{ maxWidth: "760px", textAlign: "left" }}>
        Manage your wafer process definitions. Select a process to open its dashboard.
      </p>

      <section className="process-stats" aria-live="polite">
        <p className="muted">
          {processes.length} process{processes.length === 1 ? "" : "es"} available · {activeCount} active
        </p>
      </section>

      <section className="process-grid">
        {processes.map((process) => {
          const stepCount = process.process_steps?.length ?? 0;
          return (
            <Link
              key={process.id}
              className="process-card panel"
              href={`/processes/${process.id}`}
            >
              <header className="process-card-header">
                <p className="eyebrow">Process</p>
                <p className={getStatusClass(process.is_active)}>{process.is_active ? "Active" : "Inactive"}</p>
              </header>
              <h2>{process.name}</h2>
              <p>Version {process.version}</p>
              <p className="muted">
                {process.description ? process.description : "No description set."}
              </p>
              <p className="muted">
                {stepCount} step{stepCount === 1 ? "" : "s"}
              </p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
