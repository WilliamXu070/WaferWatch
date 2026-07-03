import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import { moveWaferToProcessStep } from "@/features/runs/actions";
import {
  getFirstActiveProcessTemplateId,
  getProcessDashboardData,
  type ProcessDashboardData
} from "@/features/process-flows/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StepStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Process flow wireframe"
};

type ProcessFlowSearchParams = {
  processId?: string | string[];
};

type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  wafers: {
    assignmentId: string;
    waferCode: string;
    dieLabel: string | null;
    currentStepStatus: StepStatus | null;
  }[];
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toFlowColumns(data: ProcessDashboardData): DiagramStep[] {
  return [...data.process.process_steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      id: step.id,
      name: step.name,
      process_area: step.process_area,
      step_order: step.step_order,
      wafers: data.activeWaferStates
        .filter((state) => state.currentStepId === step.id)
        .map((state) => ({
          assignmentId: state.assignmentId,
          waferCode: state.waferCode,
          dieLabel: state.dieLabel,
          currentStepStatus: state.currentStepStatus
        }))
    }));
}

async function loadProcessFlowData(requestedProcessId: string | undefined) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  const processId = requestedProcessId ?? await getFirstActiveProcessTemplateId();
  if (!processId) {
    return null;
  }

  return getProcessDashboardData(processId, 14, false).catch(() => null);
}

export default async function ProcessFlowWireframePage({
  searchParams
}: {
  searchParams: Promise<ProcessFlowSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  const dashboardData = await loadProcessFlowData(requestedProcessId);
  const flowColumns = dashboardData ? toFlowColumns(dashboardData) : [];

  return (
    <main className="page-shell">
      <section className="page-heading" style={{ width: "100%", alignItems: "center" }}>
        <div>
          <p className="eyebrow">WaferWatch</p>
          <h1>Process flow</h1>
          <p className="muted">
            {dashboardData
              ? `${dashboardData.process.name} · ${dashboardData.activeWaferStates.length} active wafer${dashboardData.activeWaferStates.length === 1 ? "" : "s"}`
              : "No authenticated process template or wafer assignment data is available."}
          </p>
        </div>
      </section>

      <section className="panel dashboard-panel">
        {flowColumns.length === 0 ? (
          <div className="section-heading">
            <h2>No process flow data</h2>
            <p className="muted">Sign in with access to an active process template, or assign wafers to a process.</p>
          </div>
        ) : null}
        <ProcessFlowDiagram steps={flowColumns} onMoveWafer={moveWaferToProcessStep} />
      </section>
    </main>
  );
}
