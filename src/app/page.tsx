import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth/session";
import { getSupabaseStatus } from "@/lib/supabase/status";
import { getDashboardSnapshot } from "@/features/dashboard/queries";
import { signOut } from "@/features/accounts/actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [account, snapshot] = await Promise.all([
    getCurrentAccount(),
    getDashboardSnapshot()
  ]);
  const status = getSupabaseStatus();
  const primaryTemplate = snapshot.templates[0];
  const orderedSteps =
    primaryTemplate?.process_steps?.slice().sort((a, b) => a.step_order - b.step_order) ?? [];

  return (
    <main className="page-shell">
      <nav className="topbar">
        <Link className="brand" href="/">WaferWatch</Link>
        <div className="topbar-actions">
          {account ? (
            <form action={signOut}>
              <button className="button button-secondary" type="submit">Sign out</button>
            </form>
          ) : (
            <Link className="button button-primary" href="/login">Sign in</Link>
          )}
        </div>
      </nav>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">McMaster Quantum Photonic Group</p>
          <h1>WaferWatch</h1>
          <p className="hero-copy">
            Fabrication tracking, process planning, and cycle-time metrics for quantum photonic wafer development.
          </p>
        </div>
        <div className="status-strip" aria-label="Backend status">
          <span className={status.hasUrl ? "status-dot ok" : "status-dot warn"} />
          <span>Supabase {status.hasUrl && status.hasPublishableKey && status.hasServerSecret ? "connected" : "incomplete"}</span>
        </div>
      </section>

      <section className="metric-grid" aria-label="System metrics">
        <div className="metric-card">
          <span>Projects</span>
          <strong>{snapshot.counts.projects}</strong>
        </div>
        <div className="metric-card">
          <span>Wafers</span>
          <strong>{snapshot.counts.wafers}</strong>
        </div>
        <div className="metric-card">
          <span>Active steps</span>
          <strong>{snapshot.counts.activeSteps}</strong>
        </div>
        <div className="metric-card">
          <span>Storage buckets</span>
          <strong>{snapshot.counts.storageBuckets}</strong>
        </div>
      </section>

      {snapshot.errors.length ? (
        <section className="alert-panel">
          <h2>Backend alerts</h2>
          <ul>
            {snapshot.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <div className="panel stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Baseline flow</p>
              <h2>{primaryTemplate?.name ?? "No process template"}</h2>
            </div>
            {primaryTemplate ? <span className="badge">v{primaryTemplate.version}</span> : null}
          </div>
          <div className="step-list">
            {orderedSteps.map((step) => (
              <div className="step-row" key={step.id}>
                <span className="step-index">{step.step_order}</span>
                <div>
                  <strong>{step.name}</strong>
                  <p>{step.process_area} / {step.expected_duration_minutes ?? "TBD"} min</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Equipment</p>
              <h2>Tool inventory</h2>
            </div>
            <span className="badge">{snapshot.tools.length} tools</span>
          </div>
          <div className="tool-list">
            {snapshot.tools.map((tool) => (
              <div className="tool-row" key={tool.id}>
                <div>
                  <strong>{tool.name}</strong>
                  <p>{tool.tool_type} / {tool.location ?? "Unassigned"}</p>
                </div>
                <span className={`tool-status status-${tool.status}`}>{tool.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel account-panel">
        <div>
          <p className="eyebrow">Account</p>
          <h2>{account ? account.profile.display_name ?? account.email : "No active session"}</h2>
          <p className="muted">
            {account
              ? `${account.profile.role} / ${account.profile.lab_group}`
              : "Create a Supabase account before adding projects and wafers."}
          </p>
        </div>
        {account ? null : <Link className="button button-primary" href="/login">Open account page</Link>}
      </section>
    </main>
  );
}
