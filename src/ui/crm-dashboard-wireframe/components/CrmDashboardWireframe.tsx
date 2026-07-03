import { crmDashboardCopy } from "../copy";
import { CrmDashboardToolbar } from "./CrmDashboardToolbar";
import { CrmSelectedWaferPanel } from "./CrmSelectedWaferPanel";
import { CrmWorkflowBoard } from "./CrmWorkflowBoard";
import { type CrmDashboardWireframeProps } from "./CrmDashboardWireframe.props";

const defaultClassName = `
  mx-auto flex min-h-[1000px] w-full max-w-[1154px] flex-col
  gap-3.5 rounded-[20px] border border-ww-border bg-[#f6f6f2]
  p-6 shadow-[0_14px_38px_-22px_rgba(20,20,20,0.35)]
`.trim();

export function CrmDashboardWireframe({
  model,
  statusClassNameByState,
  workflowColumnClassNameByStage,
  shellClassName = defaultClassName,
  shellAriaLabel = "CRM dashboard canvas",
  selectedCardClassName = "border-[#181816] bg-[#1f1f1d] text-[#f0f0ec]",
}: CrmDashboardWireframeProps): React.JSX.Element {
  const { metrics, toolbarActions, workflowColumns, selectedWafer } = model;

  return (
    <main
      className="grid min-h-[100svh] place-items-center bg-ww-bg"
      aria-label="WaferWatch CRM dashboard preview"
    >
      <section className={shellClassName} aria-label={shellAriaLabel}>
        <CrmDashboardToolbar
          heading={crmDashboardCopy.title}
          eyebrow={crmDashboardCopy.eyebrow}
          searchAction={toolbarActions[0]}
          sortAction={toolbarActions[1]}
          filterAction={toolbarActions[2]}
          searchPlaceholder={crmDashboardCopy.toolbarPlaceholder}
        />

        <section aria-label="Dashboard metrics">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article
                key={metric.id}
                className="rounded-xl border border-ww-border bg-white p-3.5 shadow-[0_12px_28px_-24px_rgba(20,20,20,0.32)]"
                aria-label={metric.label}
              >
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66635f]">
                  {metric.label}
                </p>
                <p className="mt-2 text-3xl font-semibold leading-none text-ww-ink">
                  {metric.value}
                </p>
                {metric.delta ? (
                  <p className="mt-1.5 text-[11px] text-[#6f6f6a]">{metric.delta}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_248px]">
          <CrmWorkflowBoard
            columns={workflowColumns}
            selectedWaferId={selectedWafer.waferId}
            statusClassNameByState={statusClassNameByState}
            workflowColumnClassNameByStage={workflowColumnClassNameByStage}
            selectedCardToneClassName={selectedCardClassName}
          />

          <CrmSelectedWaferPanel
            selectedWafer={selectedWafer}
            statusClassNameByState={statusClassNameByState}
          />
        </section>
      </section>
    </main>
  );
}
