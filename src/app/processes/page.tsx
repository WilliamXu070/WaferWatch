import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/features/accounts/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listProcessTemplates } from "@/features/process-flows/queries";
import { cn, processesStyles } from "@/styles/tw";

export const dynamic = "force-dynamic";

function getStatusClass(isActive: boolean) {
  return cn(
    processesStyles.statusBase,
    isActive ? processesStyles.statusActive : processesStyles.statusInactive
  );
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
    <main className={processesStyles.shell}>
      <section className={processesStyles.heading}>
        <div className={processesStyles.headingBody}>
          <p className={processesStyles.eyebrow}>WaferWatch</p>
          <h1 className={processesStyles.title}>Processes</h1>
        </div>
        <div className={processesStyles.headingActions}>
          <Link href="/wafer-visualizer" className={processesStyles.secondaryButton}>
            Wafer visualizer
          </Link>
          <form action={signOut}>
            <button className={processesStyles.secondaryButton} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>

      <p className={processesStyles.bodyCopy}>
        Manage your wafer process definitions. Select a process to open its dashboard.
      </p>

      <section aria-live="polite">
        <p className={processesStyles.stats}>
          {processes.length} process{processes.length === 1 ? "" : "es"} available · {activeCount} active
        </p>
      </section>

      <section className={processesStyles.grid}>
        {processes.map((process) => {
          const stepCount = process.process_steps?.length ?? 0;
          return (
            <Link
              key={process.id}
              className={processesStyles.card}
              href={`/processes/${process.id}`}
            >
              <header className={processesStyles.cardHeader}>
                <p className={processesStyles.eyebrow}>Process</p>
                <p className={getStatusClass(process.is_active)}>{process.is_active ? "Active" : "Inactive"}</p>
              </header>
              <h2 className={processesStyles.cardTitle}>{process.name}</h2>
              <p className={processesStyles.cardMeta}>Version {process.version}</p>
              <p className={processesStyles.cardMeta}>
                {process.description ? process.description : "No description set."}
              </p>
              <p className={processesStyles.cardMeta}>
                {stepCount} step{stepCount === 1 ? "" : "s"}
              </p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
