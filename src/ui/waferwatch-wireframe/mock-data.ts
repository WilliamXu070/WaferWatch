import { currentProcess } from "./nav";
import type {
  CalendarModel,
  DashboardModel,
  FlowModel,
  ProcessSummary,
  WaferStatusModel,
  WaferStatusTileModel,
  WaferTileStatus
} from "./types";

export const processSummary: ProcessSummary = currentProcess;

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export const dashboardModel: DashboardModel = {
  activity: {
    title: "Process activity",
    max: 30,
    bars: [
      { label: "Mon", value: 16, compareValue: 22 },
      { label: "Tue", value: 24, compareValue: 13 },
      { label: "Wed", value: 18, compareValue: 21 },
      { label: "Thu", value: 28, compareValue: 13 },
      { label: "Fri", value: 14, compareValue: 9 }
    ]
  },
  progress: {
    title: "Step progress",
    percent: 72,
    caption: "On track",
    footer: "Overall progress"
  },
  stats: [
    {
      id: "wafers-running",
      value: "18",
      label: "Wafers running",
      icon: "activity",
      href: "/wireframe/process-flow"
    },
    {
      id: "blocked-failed",
      value: "4",
      label: "Blocked / failed",
      icon: "warning",
      href: "/wireframe/process-flow"
    }
  ],
  columns: [
    {
      id: "queued",
      title: "Queued",
      count: 12,
      cards: [
        {
          id: "alpha-04",
          waferCode: "ALPHA-04",
          dieLabel: "A7",
          description: "Queued for poling run at Waterloo. Handler assigned.",
          status: "queued",
          dueLabel: "Today",
          activityLabel: "2 notes"
        },
        {
          id: "alpha-09",
          waferCode: "ALPHA-09",
          dieLabel: "B2",
          description: "Pending tool reservation and recipe confirmation.",
          status: "pending",
          dueLabel: "No date",
          activityLabel: "1 note"
        }
      ]
    },
    {
      id: "poling",
      title: "Poling",
      count: 17,
      cards: [
        {
          id: "alpha-12",
          waferCode: "ALPHA-12",
          dieLabel: "C5",
          description: "Poling in progress. Voltage sweep attached to run.",
          status: "running",
          dueLabel: "10 Mar",
          activityLabel: "4 logs",
          isSelected: true
        },
        {
          id: "alpha-15",
          waferCode: "ALPHA-15",
          dieLabel: "D1",
          description: "Running with Adam. Next step: inspection.",
          status: "running",
          dueLabel: "21 Mar",
          activityLabel: "3 logs"
        }
      ]
    },
    {
      id: "inspection",
      title: "Inspection",
      count: 13,
      cards: [
        {
          id: "alpha-18",
          waferCode: "ALPHA-18",
          dieLabel: "E3",
          description:
            "Inspection blocked by missing microscope slot. Needs schedule adjustment before next handler clean.",
          status: "blocked",
          dueLabel: "16 Apr",
          activityLabel: "1 note",
          handler: "Barbara"
        },
        {
          id: "alpha-21",
          waferCode: "ALPHA-21",
          dieLabel: "F8",
          description: "Inspection complete. Awaiting review note.",
          status: "completed",
          dueLabel: "24 Apr",
          activityLabel: "2 notes"
        }
      ]
    },
    {
      id: "complete",
      title: "Complete",
      count: 12,
      cards: [
        {
          id: "alpha-02",
          waferCode: "ALPHA-02",
          dieLabel: "A1",
          description: "Completed poling and inspection sequence.",
          status: "completed",
          dueLabel: "05 Apr",
          activityLabel: "3 logs"
        },
        {
          id: "alpha-06",
          waferCode: "ALPHA-06",
          dieLabel: "B4",
          description: "Closed with final die description saved.",
          status: "completed",
          dueLabel: "30 Mar",
          activityLabel: "7 logs"
        }
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* Process flow                                                        */
/* ------------------------------------------------------------------ */

export const flowModel: FlowModel = {
  title: "Process flow",
  subtitle: "Track wafer movement through each fabrication step.",
  steps: [
    {
      id: "start",
      name: "Start",
      process_area: "Process entry",
      step_order: 0,
      status: "completed",
      role: "start",
      icon: "start",
      x: 420,
      y: 18,
      nextStepIds: ["intake"],
      wafers: [
        { assignmentId: "alpha-a1-start", waferCode: "ALPHA-01", dieLabel: "A1", currentStepStatus: "completed" },
        { assignmentId: "alpha-a2-start", waferCode: "ALPHA-02", dieLabel: "A2", currentStepStatus: "completed" },
        { assignmentId: "alpha-a3-start", waferCode: "ALPHA-03", dieLabel: "A3", currentStepStatus: "completed" },
        { assignmentId: "alpha-a4-start", waferCode: "ALPHA-04", dieLabel: "A4", currentStepStatus: "completed" },
        { assignmentId: "alpha-a5-start", waferCode: "ALPHA-05", dieLabel: "A5", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-01", waferCode: "ALPHA-06", dieLabel: "A6", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-02", waferCode: "ALPHA-07", dieLabel: "A7", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-03", waferCode: "ALPHA-08", dieLabel: "A8", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-04", waferCode: "ALPHA-09", dieLabel: "B1", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-05", waferCode: "ALPHA-10", dieLabel: "B2", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-06", waferCode: "ALPHA-11", dieLabel: "B3", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-07", waferCode: "ALPHA-12", dieLabel: "B4", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-08", waferCode: "ALPHA-13", dieLabel: "C1", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-09", waferCode: "ALPHA-14", dieLabel: "C2", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-10", waferCode: "ALPHA-15", dieLabel: "C3", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-11", waferCode: "ALPHA-16", dieLabel: "D1", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-12", waferCode: "ALPHA-17", dieLabel: "D2", currentStepStatus: "completed" },
        { assignmentId: "alpha-extra-13", waferCode: "ALPHA-18", dieLabel: "D3", currentStepStatus: "completed" }
      ]
    },
    {
      id: "intake",
      name: "Wafer intake and inspection",
      process_area: "Inspection",
      step_order: 1,
      status: "completed",
      icon: "file",
      x: 420,
      y: 132,
      nextStepIds: ["litho"],
      returnStepIds: ["solvent"],
      wafers: [
        { assignmentId: "alpha-a1-intake", waferCode: "ALPHA-01", dieLabel: "A1", currentStepStatus: "completed" },
        { assignmentId: "alpha-a2-intake", waferCode: "ALPHA-02", dieLabel: "A2", currentStepStatus: "completed" }
      ]
    },
    {
      id: "solvent",
      name: "Solvent clean",
      process_area: "Clean",
      step_order: 2,
      status: "queued",
      icon: "droplet",
      x: 690,
      y: 226,
      returnStepIds: ["litho"],
      wafers: [
        { assignmentId: "alpha-a3-solvent", waferCode: "ALPHA-03", dieLabel: "A3", currentStepStatus: "queued" }
      ]
    },
    {
      id: "litho",
      name: "Lithography coat and expose",
      process_area: "Lithography",
      step_order: 3,
      status: "active",
      icon: "scan",
      x: 420,
      y: 292,
      nextStepIds: ["etch"],
      wafers: [
        { assignmentId: "alpha-a4-litho", waferCode: "ALPHA-04", dieLabel: "A4", currentStepStatus: "running" },
        { assignmentId: "alpha-a5-litho", waferCode: "ALPHA-05", dieLabel: "A5", currentStepStatus: "running" },
        { assignmentId: "alpha-a6-litho", waferCode: "ALPHA-06", dieLabel: "A6", currentStepStatus: "running" },
        { assignmentId: "alpha-a7-litho", waferCode: "ALPHA-07", dieLabel: "A7", currentStepStatus: "running" },
        { assignmentId: "alpha-a8-litho", waferCode: "ALPHA-08", dieLabel: "A8", currentStepStatus: "running" }
      ]
    },
    {
      id: "etch",
      name: "Etch",
      process_area: "Etch",
      step_order: 4,
      status: "queued",
      icon: "etch",
      x: 420,
      y: 412,
      nextStepIds: ["characterization"],
      wafers: [
        { assignmentId: "alpha-b1-etch", waferCode: "ALPHA-09", dieLabel: "B1", currentStepStatus: "queued" },
        { assignmentId: "alpha-b2-etch", waferCode: "ALPHA-10", dieLabel: "B2", currentStepStatus: "queued" }
      ]
    },
    {
      id: "characterization",
      name: "Characterization",
      process_area: "Metrology",
      step_order: 5,
      status: "pending",
      icon: "characterization",
      x: 420,
      y: 512,
      wafers: [
        { assignmentId: "alpha-c1-characterization", waferCode: "ALPHA-13", dieLabel: "C1", currentStepStatus: "pending" }
      ]
    }
  ],
  stats: [
    { id: "total", icon: "total", label: "Total steps", value: "6", caption: "Defined in flow" },
    {
      id: "active",
      icon: "target",
      label: "Active step",
      value: "3",
      caption: "Lithography coat and expose"
    },
    { id: "completed", icon: "check", label: "Completed steps", value: "2 / 6", caption: "33% complete" },
    { id: "blocked", icon: "warning", label: "Blocked steps", value: "0", caption: "No issues" },
    {
      id: "handoff",
      icon: "handoff",
      label: "Recent handoff",
      value: "10:24 AM",
      caption: "Intake → Lithography"
    },
    { id: "wafers", icon: "stack", label: "Wafer count", value: "18", caption: "In this process" }
  ]
};

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

const calendarPeople = [
  { id: "00000000-0000-4000-8000-000000000001", display_name: "adam" },
  { id: "00000000-0000-4000-8000-000000000002", display_name: "barbara" }
];

export const calendarModel: CalendarModel = {
  title: "Calendar",
  subtitle: "Process work across McMaster, Waterloo, and Toronto.",
  rangeLabel: "Mon, Jun 29 – Sun, Jul 5",
  sites: [
    { id: "McMaster", name: "McMaster", region: "Hamilton" },
    { id: "Waterloo", name: "Waterloo", region: "Waterloo" },
    { id: "Toronto", name: "Toronto", region: "Toronto" }
  ],
  people: calendarPeople,
  events: [
    {
      id: "evt-intake",
      process_template_id: processSummary.id,
      location: "McMaster",
      starts_at: "2026-06-30T13:00:00.000Z",
      ends_at: "2026-06-30T14:30:00.000Z",
      process_step_id: "intake",
      manual_action: null,
      description: "Wafer intake and inspection",
      people: []
    },
    {
      id: "evt-litho",
      process_template_id: processSummary.id,
      location: "Waterloo",
      starts_at: "2026-06-30T12:00:00.000Z",
      ends_at: "2026-07-03T20:00:00.000Z",
      process_step_id: "litho",
      manual_action: null,
      description: "Lithography coat and expose",
      people: [calendarPeople[1]]
    },
    {
      id: "evt-clean",
      process_template_id: processSummary.id,
      location: "Toronto",
      starts_at: "2026-06-29T17:00:00.000Z",
      ends_at: "2026-06-29T18:00:00.000Z",
      process_step_id: null,
      manual_action: "Tool cleaning",
      description: "Tool cleaning",
      people: [calendarPeople[0]]
    }
  ],
  handoffs: [
    {
      id: "handoff-04",
      dayLabel: "Today",
      waferCode: "ALPHA-04",
      dieLabel: "A7",
      note: "Queued for poling at Waterloo",
      activityLabel: "2 notes",
      tone: "neutral"
    },
    {
      id: "handoff-12",
      dayLabel: "Wed 1",
      waferCode: "ALPHA-12",
      dieLabel: "C5",
      note: "Voltage sweep attached to run",
      activityLabel: "4 logs",
      tone: "info"
    },
    {
      id: "handoff-18",
      dayLabel: "Fri 3",
      waferCode: "ALPHA-18",
      dieLabel: "E3",
      note: "Microscope slot still blocked",
      activityLabel: "1 note",
      tone: "warning"
    },
    {
      id: "handoff-21",
      dayLabel: "Sun 5",
      waferCode: "ALPHA-21",
      dieLabel: "F8",
      note: "Inspection complete",
      activityLabel: "2 notes",
      tone: "positive"
    }
  ]
};

/* ------------------------------------------------------------------ */
/* Wafer / die status                                                  */
/* ------------------------------------------------------------------ */

const alphaStatuses: WaferTileStatus[] = [
  "litho",
  "etch",
  "inspection",
  "bond",
  "test",
  "dice",
  "test",
  "dice"
];

const betaStatuses: WaferTileStatus[] = [
  "litho",
  "etch",
  "inspection",
  "bond",
  "test",
  "test",
  "dice",
  "dice"
];

function makeWaferTiles(
  family: string,
  statuses: readonly WaferTileStatus[],
  selectedCode?: string,
  isUndiced = false
): WaferStatusTileModel[] {
  return statuses.map((status, index) => {
    const dieNumber = index + 1;
    const prefix = family.slice(0, 1);
    const code = `${prefix}${dieNumber}`;
    const stepLabelByStatus: Record<WaferTileStatus, string> = {
      litho: "Litho",
      etch: "Etch",
      inspection: "Insp",
      bond: "Bond",
      test: "Test",
      dice: "Dice",
      queued: "Queued"
    };

    return {
      id: `${family.toLowerCase()}-${dieNumber}`,
      code,
      family,
      dieLabel: code,
      stepLabel: stepLabelByStatus[status],
      status,
      waferStateName:
        status === "litho" || status === "queued"
          ? "Pre-dice clean"
          : status === "inspection"
            ? "Post ELB inspection"
            : "Post poling",
      isUndiced,
      isSelected: code === selectedCode
    };
  });
}

export const waferStatusModel: WaferStatusModel = {
  metrics: [
    { id: "wafers", label: "Wafers", value: "3", tone: "neutral" },
    { id: "active", label: "Active", value: "26", tone: "active" },
    { id: "progress", label: "In progress", value: "5", tone: "running" },
    { id: "yield", label: "Yield", value: "84%", tone: "yield" }
  ],
  families: [
    {
      id: "alpha",
      name: "ALPHA",
      status: "active",
      tiles: makeWaferTiles("ALPHA", alphaStatuses, "A6")
    },
    {
      id: "beta",
      name: "BETA",
      status: "active",
      tiles: makeWaferTiles("BETA", betaStatuses)
    },
    {
      id: "gamma",
      name: "GAMMA",
      status: "setup",
      tiles: makeWaferTiles("GAMMA", ["queued"], undefined, true)
    }
  ]
};

export const calendarWindow = {
  startDate: "2026-06-29",
  days: 7
};
