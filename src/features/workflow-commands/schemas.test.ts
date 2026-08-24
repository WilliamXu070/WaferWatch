import assert from "node:assert/strict";
import test from "node:test";
import { workflowCommandKinds, workflowCommandSchema } from "./schemas";

const id = (suffix: number) => `90000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

test("the workflow command contract exposes every agreed command kind", () => {
  assert.deepEqual([...workflowCommandKinds].sort(), [
    "calendar.create",
    "calendar.delete",
    "calendar.move",
    "process.step.create",
    "process.transition.create",
    "wafer.archive",
    "wafer.batch.move",
    "wafer.create",
    "wafer.redo",
    "wafer.route",
    "wafer.submit"
  ]);
});

test("a step command requires actor, template, idempotency, revision, and typed payload", () => {
  const parsed = workflowCommandSchema.parse({
    kind: "process.step.create",
    actorId: id(1),
    templateId: id(2),
    mutationId: id(3),
    expectedWorkspaceRevision: 7,
    payload: {
      name: "Inspection",
      processArea: "Metrology",
      nodeType: "procedure",
      canvasX: 320,
      canvasY: 180,
      parametersSchema: { version: 1, fields: [] }
    }
  });
  assert.equal(parsed.kind, "process.step.create");
  assert.equal(parsed.expectedWorkspaceRevision, 7);
});

test("batch movement rejects duplicated operation ids before persistence", () => {
  const command = {
    kind: "wafer.batch.move",
    actorId: id(1),
    templateId: id(2),
    mutationId: id(3),
    payload: {
      mutations: [
        {
          kind: "move",
          batchId: id(4),
          mutationId: id(3),
          assignmentId: id(5),
          sourceStepId: id(6),
          targetStepId: id(7),
          note: "Move batch",
          correctCheckpointRoute: false
        },
        {
          kind: "move",
          batchId: id(4),
          mutationId: id(3),
          assignmentId: id(8),
          sourceStepId: id(6),
          targetStepId: id(7),
          note: "Move batch",
          correctCheckpointRoute: false
        }
      ]
    }
  };
  assert.equal(workflowCommandSchema.safeParse(command).success, false);
});
