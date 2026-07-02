import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";

export const metadata = {
  title: "Process flow wireframe"
};

const demoSteps = [
  {
    id: "wireframe-intake",
    name: "Wafer intake and inspection",
    process_area: "Inspection",
    step_order: 1,
    wafers: [
      {
        assignmentId: "demo-a1",
        waferCode: "A1",
        dieLabel: "A1",
        currentStepStatus: "completed" as const
      },
      {
        assignmentId: "demo-a2",
        waferCode: "A2",
        dieLabel: "A2",
        currentStepStatus: "completed" as const
      }
    ]
  },
  {
    id: "wireframe-solvent",
    name: "Solvent clean",
    process_area: "Cleaning",
    step_order: 2,
    wafers: [
      {
        assignmentId: "demo-a3",
        waferCode: "A3",
        dieLabel: "A3",
        currentStepStatus: "queued" as const
      }
    ]
  },
  {
    id: "wireframe-lithography",
    name: "Lithography coat and expose",
    process_area: "Lithography",
    step_order: 3,
    wafers: [
      {
        assignmentId: "demo-a4",
        waferCode: "A4",
        dieLabel: "A4",
        currentStepStatus: "running" as const
      },
      {
        assignmentId: "demo-a5",
        waferCode: "A5",
        dieLabel: "A5",
        currentStepStatus: "running" as const
      },
      {
        assignmentId: "demo-a6",
        waferCode: "A6",
        dieLabel: "A6",
        currentStepStatus: "running" as const
      }
    ]
  },
  {
    id: "wireframe-etch",
    name: "Etch",
    process_area: "Etch",
    step_order: 4,
    wafers: [
      {
        assignmentId: "demo-b1",
        waferCode: "B1",
        dieLabel: "B1",
        currentStepStatus: "pending" as const
      },
      {
        assignmentId: "demo-b2",
        waferCode: "B2",
        dieLabel: "B2",
        currentStepStatus: "pending" as const
      }
    ]
  },
  {
    id: "wireframe-characterization",
    name: "Characterization",
    process_area: "Metrology",
    step_order: 5,
    wafers: [
      {
        assignmentId: "demo-c1",
        waferCode: "C1",
        dieLabel: "C1",
        currentStepStatus: "pending" as const
      }
    ]
  }
];

export default function ProcessFlowWireframePage() {
  return (
    <main className="page-shell">
      <section className="panel dashboard-panel">
        <ProcessFlowDiagram steps={demoSteps} />
      </section>
    </main>
  );
}
