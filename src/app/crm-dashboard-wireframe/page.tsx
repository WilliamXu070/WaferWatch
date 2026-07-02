import {
  crmDashboardCopy,
  crmDashboardSelectedWafer,
  crmDashboardStatusClassName,
  crmDashboardWireframeModel,
  crmDashboardWorkflowColumnClassName
} from "@/ui/crm-dashboard-wireframe";
import styles from "./page.module.css";

function renderCardMetaRows(rows: readonly { label: string; value: string }[]) {
  return rows.map((row) => (
    <p key={`${row.label}-${row.value}`} className={styles.waferMeta}>
      <span>{row.label}:</span>
      <strong>{row.value}</strong>
    </p>
  ));
}

export default function CrmDashboardWireframePreviewPage() {
  const { metrics, toolbarActions, workflowColumns } = crmDashboardWireframeModel;
  const selectedWaferId = crmDashboardSelectedWafer.waferId;

  const [searchAction, sortAction, filterAction] = toolbarActions;

  return (
    <main className={styles.previewRoot}>
      <section className={styles.canvas}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>{crmDashboardCopy.eyebrow}</p>
            <h1 className={styles.title}>WaferWatch</h1>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchLabel} htmlFor="dashboard-search">
              Search
            </label>
            <input
              id="dashboard-search"
              aria-label={searchAction.controlLabel}
              className={styles.search}
              defaultValue=""
              placeholder={crmDashboardCopy.toolbarPlaceholder}
              type="text"
            />
            <button className={styles.controlButton} type="button">
              {sortAction.label}
            </button>
            <button className={styles.controlButton} type="button">
              {filterAction.label}
            </button>
          </div>
        </header>

        <section className={styles.metrics}>
          {metrics.map((metric) => (
            <article key={metric.id} className={styles.metricCard}>
              <p className={styles.metricLabel}>{metric.label}</p>
              <p className={styles.metricValue}>{metric.value}</p>
              <p className={styles.metricDelta}>{metric.delta}</p>
            </article>
          ))}
        </section>

        <section className={styles.boardAndPanel}>
          <section className={styles.boardSection}>
            {workflowColumns.map((column) => (
              <section
                key={column.id}
                aria-label={column.title}
                className={`${styles.column} ${crmDashboardWorkflowColumnClassName[column.id]}`}
              >
                <div className={styles.columnHeader}>
                  <div>
                    <p className={styles.columnTitle}>{column.title}</p>
                    <p className={styles.columnSub}>{column.subtitle}</p>
                  </div>
                  <p className={styles.columnCount}>{column.countLabel}</p>
                </div>

                <div className={styles.cards}>
                  {column.cards.map((card) => (
                    <article
                      key={card.id}
                      className={`${styles.card} ${card.id === selectedWaferId ? styles.cardSelected : ""}`}
                    >
                      <p className={styles.waferHeader}>
                        {card.waferCode}
                        <span className={styles.dieLabel}>{card.dieLabel}</span>
                      </p>

                      <p className={styles.waferText}>Owner: {card.owner}</p>
                      {renderCardMetaRows(card.meta)}
                      <p className={styles.waferText}>Location: {card.location}</p>
                      <p className={styles.waferText}>Handler: {card.handler}</p>
                      <p className={styles.waferText}>Due: {card.dueLabel}</p>

                      <span className={`${styles.status} ${crmDashboardStatusClassName[card.status]}`}>
                        {card.status}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </section>

          <aside className={styles.sidePanel} aria-label={crmDashboardCopy.selectedWaferLabel}>
            <header className={styles.sideHeader}>
              <p className={styles.sideHeading}>{crmDashboardCopy.selectedWaferLabel}</p>
              <h2 className={styles.selectedWafer}>{crmDashboardSelectedWafer.title}</h2>
            </header>

            <div className={styles.statusTagRow}>
              <span className={styles.statusTagLabel}>Status</span>
              <span
                className={`${styles.status} ${crmDashboardStatusClassName[crmDashboardSelectedWafer.status]}`}
              >
                {crmDashboardSelectedWafer.status}
              </span>
            </div>

            <div className={styles.sideRows}>
              {crmDashboardSelectedWafer.rows.map((row) => (
                <div className={styles.sideRow} key={row.label}>
                  <span className={styles.sideLabel}>{row.label}</span>
                  <span className={styles.sideValue}>{row.value}</span>
                </div>
              ))}
            </div>

            <p className={styles.nextAction}>
              <strong>Next action</strong> {crmDashboardSelectedWafer.nextAction}
            </p>
          </aside>
        </section>
      </section>
    </main>
  );
}
