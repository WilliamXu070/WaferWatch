import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StepParameterEntryDialog } from "./StepParameterEntryDialog";

test("renders the moved item, global template values, and local parameter controls", () => {
  const markup = renderToStaticMarkup(
    <StepParameterEntryDialog
      entry={{
        assignmentId: "00000000-0000-4000-8000-000000000001",
        movementMutationId: "00000000-0000-4000-8000-000000000002",
        waferLabel: "GAMMA_2_1",
        stepId: "00000000-0000-4000-8000-000000000003",
        stepName: "Dicing",
        parametersSchema: {
          version: 1,
          fields: [{
            id: "blade-speed",
            key: "blade_speed",
            label: "Blade speed",
            type: "number",
            unit: "rpm",
            required: true,
            description: "Measured spindle speed",
            defaultValue: "12000"
          }]
        }
      }}
      total={1}
      onSave={async () => ({ ok: false, error: "Not submitted during render" })}
      onComplete={() => undefined}
      onSkipAll={() => undefined}
    />
  );

  assert.match(markup, /Record the values for GAMMA_2_1/);
  assert.match(markup, /Blade speed/);
  assert.match(markup, /value="12000"/);
  assert.match(markup, /Parameter/);
  assert.match(markup, /Value/);
  assert.match(markup, /Notes/);
  assert.match(markup, /Additional notes/);
  assert.match(markup, /Add row/);
  assert.doesNotMatch(markup, /Edit template/);
});
